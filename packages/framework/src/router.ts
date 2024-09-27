import type { URLPattern as URLPatternType } from "urlpattern-polyfill";

import { assert } from "framework/utils";

export type IndexRouteDefinition<T> = {
	cache?: boolean;
	import?: () => Promise<T>;
	index: true;
	pattern?: URLPatternInit;
};

export type NonIndexRouteDefinition<T> = {
	cache?: boolean;
	import?: () => Promise<T>;
	index?: false;
	pattern?: URLPatternInit;
	children?: RouteDefinition<T>[];
};

export type RouteDefinition<T> =
	| IndexRouteDefinition<T>
	| NonIndexRouteDefinition<T>;

// biome-ignore lint/suspicious/noExplicitAny: needed
export type RouteMatch<Route extends RouteDefinition<any>> = {
	matched: URLPatternResult;
	route: Route;
};

let PatternPolyfill: typeof URLPatternType | undefined =
	typeof global !== "undefined" && "URLPattern" in global && global.URLPattern
		? (global.URLPattern as typeof URLPatternType)
		: typeof globalThis !== "undefined" &&
				"URLPattern" in globalThis &&
				// biome-ignore lint/suspicious/noExplicitAny: needed
				(globalThis as any).URLPattern
			? // biome-ignore lint/suspicious/noExplicitAny: needed
				((globalThis as any).URLPattern as typeof URLPatternType)
			: typeof window !== "undefined" &&
					"URLPattern" in window &&
					window.URLPattern
				? (window.URLPattern as typeof URLPatternType)
				: typeof document !== "undefined" &&
						"URLPattern" in document &&
						document.URLPattern
					? (document.URLPattern as typeof URLPatternType)
					: undefined;

// biome-ignore lint/suspicious/noExplicitAny: needed
export async function matchRoutes<Route extends RouteDefinition<any>>(
	routes: Route[],
	url: URL,
): Promise<RouteMatch<Route>[] | null> {
	for (const route of routes) {
		const matches = await matchRoute(route, url);
		if (matches) {
			return matches;
		}
	}

	return null;
}

// biome-ignore lint/suspicious/noExplicitAny: needed
async function matchRoute<Route extends RouteDefinition<any>>(
	route: Route,
	url: URL,
	parentPattern: URLPatternInit | undefined = undefined,
	parentMatches: RouteMatch<Route>[] = [],
): Promise<RouteMatch<Route>[] | null> {
	if (!PatternPolyfill) {
		PatternPolyfill = await import("urlpattern-polyfill").then(
			(m) => m.URLPattern,
		);
	}
	assert(PatternPolyfill, "URLPattern is not available");

	const routePattern = route.pattern ? route.pattern : { pathname: "/" };
	const pattern: URLPatternInit = {
		baseURL: routePattern.baseURL ?? parentPattern?.baseURL,
		hostname: routePattern.hostname ?? parentPattern?.hostname,
		pathname: joinPathname(parentPattern?.pathname, routePattern.pathname),
		protocol: routePattern.protocol ?? parentPattern?.protocol,
		search: routePattern.search,
		port: routePattern.port ?? parentPattern?.port,
	};

	let matched: URLPatternResult | null = null;
	if (route.index || !!route.pattern) {
		matched = new PatternPolyfill(pattern).exec({ pathname: url.pathname });
	}

	if (!route.index && route.children) {
		for (const child of route.children) {
			const childMatches = await matchRoute<Route>(
				child as Route,
				url,
				pattern,
				matched ? [...parentMatches, { route, matched }] : parentMatches,
			);
			if (childMatches) {
				return childMatches;
			}
		}
	}
	return matched ? [...parentMatches, { route, matched }] : null;
}

function cleanPathname(path: string | undefined) {
	return path?.replace(/^\/+/, "").replace(/\/+$/, "") ?? "";
}

function joinPathname(a: string | undefined, b: string | undefined) {
	return `/${cleanPathname(`${cleanPathname(a)}/${cleanPathname(b)}`)}`;
}
