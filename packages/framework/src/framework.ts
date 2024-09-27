import { AsyncLocalStorage } from "node:async_hooks";

import type * as React from "react";

import type {
	IndexRouteDefinition as BaseIndexRouteDefinition,
	NonIndexRouteDefinition as BaseNonIndexRouteDefinition,
} from "framework/router";
import { matchRoutes } from "framework/router";
import { assert } from "framework/utils";

export { assert };

export type ServiceBindingFactoryArgs = {
	name: string;
};

export type ServiceBindingFactory = (
	args: ServiceBindingFactoryArgs,
) => ServiceBinding;

export interface ServiceBinding {
	fetch(request: Request): Promise<Response>;
}

export interface EyeballBuildOutput {
	fetch(request: Request, c: FrameworkContext<Environment>): Promise<Response>;
}

export type EyeballFunction = () =>
	| never
	| undefined
	| null
	| Response
	| Promise<never | undefined | null | Response>;

export type ServerRouteModule = {
	// biome-ignore lint/suspicious/noExplicitAny: needed
	default: new () => ServerEntry<any, any>;
	eyeball?: EyeballFunction;
};

export type ReactRouteModule = {
	// biome-ignore lint/suspicious/noExplicitAny: better for everyone
	default: React.FC<any>;
	eyeball?: EyeballFunction;
};

export type IndexRouteDefinition = BaseIndexRouteDefinition<RouteModule> & {
	id?: string;
	parallel?: Record<string, RouteDefinition>;
};

export type NonIndexRouteDefinition = Omit<
	BaseNonIndexRouteDefinition<RouteModule>,
	"children"
> & {
	id?: string;
	parallel?: Record<string, RouteDefinition>;
	children?: RouteDefinition[];
};

export type RouteModule = ServerRouteModule | ReactRouteModule;

export type RouteDefinition = IndexRouteDefinition | NonIndexRouteDefinition;

// const mod!: RouteModule<EnvironmentKeys>;
// // biome-ignore lint/suspicious/noPrototypeBuiltins: <explanation>
// if (ServerEntry.isPrototypeOf(mod.default)) {
// 	const ServerEntry =
// 		mod.default as ServerRouteModule<EnvironmentKeys>["default"];
// 	const t = new ServerEntry();
// 	t.fetch(new Request(""));
// }

export async function handleRequest(
	request: Request,
	c: FrameworkContext<PartialEnvironment<EnvironmentKeys>>,
	routes: RouteDefinition[],
): Promise<Response> {
	const url = new URL(request.url);
	const matches = await matchRoutes(routes, url);

	if (!matches || matches.length === 0) {
		return new Response("", { status: 404 });
	}

	const modulePromises: (Promise<RouteModule> | null)[] = [];
	let lastModulePromise: Promise<RouteModule> | null = null;
	for (const { route } of matches) {
		const promise = route.import?.() ?? null;
		modulePromises.push(promise);
		if (promise) {
			lastModulePromise = promise;
		}
	}

	assert(lastModulePromise, "No module to load from matched routes.");

	const lastModule = await lastModulePromise;

	// biome-ignore lint/suspicious/noPrototypeBuiltins: <explanation>
	if (ServerEntry.isPrototypeOf(lastModule.default)) {
		const Entry = lastModule.default as ServerRouteModule["default"];
		const entry = new Entry();
		return UNSAFE_FrameworkContextStorage.run(
			{
				cookie: c.cookie,
				env: c.env,
				storage: c.storage,
				waitUntil: c.waitUntil,
			},
			async () => {
				return entry.fetch(request);
			},
		);
	}

	return new Response("TODO: Implement React route handling.", { status: 500 });
}

export type UNSAFE_CookieHandler = {
	cookie: Cookie;
	send(response: Response): Response;
};

export function UNSAFE_createCookieHandler(
	cookie: string | null,
	secrets: string[] | null | undefined,
): UNSAFE_CookieHandler {
	// TODO: Implement cookie handler.
	return {
		cookie: {
			get(key, required) {},
			getUnsigned(key, required) {},
			set(key, value) {},
			setUnsigned(key, value) {},
			unset(key) {},
		},
		send(response) {
			return response;
		},
	};
}

export interface NeutralServerEntry {
	fetch(request: Request): Response | Promise<Response>;
}

export interface Environment {
	[key: string]: unknown;
}

export type EnvironmentKeys = keyof Environment;

export type BlockConcurrencyWhile = <T>(
	callback: () => Promise<T>,
) => Promise<T>;

// biome-ignore lint/suspicious/noExplicitAny: better for everyone
export type WaitUntil = (promise: Promise<any>) => void;

export abstract class ServerEntry<
	Name extends string,
	Dependencies extends EnvironmentKeys,
> implements NeutralServerEntry
{
	env: PartialEnvironment<Dependencies>;
	cookie: Cookie;
	waitUntil: WaitUntil;

	constructor() {
		const c = getContext<Dependencies>();

		this.env = c.env;
		this.cookie = c.cookie;
		this.waitUntil = c.waitUntil;
	}
	abstract fetch(request: Request): Response | Promise<Response>;
}

interface DurableId {
	toString(): string;
	readonly name?: string;
}

export abstract class Durable<
	Name extends string,
	Dependencies extends EnvironmentKeys,
> {
	blockConcurrencyWhile: BlockConcurrencyWhile;
	env: PartialEnvironment<Dependencies>;
	id: DurableId;
	storage: Storage;

	constructor() {
		const c = UNSAFE_FrameworkContextStorage.getStore();
		assert(c, "No context available.");
		assert(c.blockConcurrencyWhile, "No blockConcurrencyWhile available.");
		assert(c.durableId, "No durable ID available.");
		assert(c.env, "Environment not available.");
		assert(c.storage, "Storage not available.");

		this.blockConcurrencyWhile = c.blockConcurrencyWhile;
		this.env = c.env as PartialEnvironment<Dependencies>;
		this.id = c.durableId;
		this.storage = c.storage;
	}
}

export interface Storage {
	get<T = unknown>(
		key: string,
		options?: DurableObjectGetOptions,
	): Promise<T | undefined>;
	get<T = unknown>(
		keys: string[],
		options?: DurableObjectGetOptions,
	): Promise<Map<string, T>>;
	list<T = unknown>(
		options?: DurableObjectListOptions,
	): Promise<Map<string, T>>;
	put<T>(
		key: string,
		value: T,
		options?: DurableObjectPutOptions,
	): Promise<void>;
	put<T>(
		entries: Record<string, T>,
		options?: DurableObjectPutOptions,
	): Promise<void>;
	delete(key: string, options?: DurableObjectPutOptions): Promise<boolean>;
	delete(keys: string[], options?: DurableObjectPutOptions): Promise<number>;
}

export type PartialEnvironment<Dependencies extends EnvironmentKeys> = {
	[K in Dependencies]: K extends keyof Environment ? Environment[K] : never;
};

const REDIRECT_SYMBOL: unique symbol = Symbol.for("framework.redirect");

export interface FrameworkContext<
	Env extends Partial<Environment> = Environment,
> {
	[REDIRECT_SYMBOL]?: To;
	blockConcurrencyWhile?: BlockConcurrencyWhile;
	cookie?: Cookie;
	durableId?: DurableId;
	env?: Env;
	storage?: Storage;
	waitUntil?: WaitUntil;
}

export interface Context<Env extends Partial<Environment> = Environment> {
	cookie: Cookie;
	env: Env;
	waitUntil: WaitUntil;
}

export const UNSAFE_FrameworkContextStorage =
	new AsyncLocalStorage<FrameworkContext>();

function assertContext(c: FrameworkContext | undefined): asserts c is Context {
	assert(c, "No context available.");
	assert(c.cookie, "No cookie available.");
	assert(c.env, "No environment available.");
	assert(c.waitUntil, "No waitUntil available.");
}

export function getContext<
	Dependencies extends EnvironmentKeys = never,
>(): Context<PartialEnvironment<Dependencies>> {
	const c = UNSAFE_FrameworkContextStorage.getStore();
	assertContext(c);

	return c as Context<PartialEnvironment<Dependencies>>;
}

// biome-ignore lint/suspicious/noExplicitAny: needed for inference.
type ActionFunction = (formData: FormData) => any;

type Action<T extends ActionFunction> = {
	action: (formData: FormData) => Promise<void>;
	data: Awaited<ReturnType<T>> | undefined;
};

export function getAction<Func extends ActionFunction>(
	actionFunction: Func,
): Action<Func> {
	return {
		action: async () => {},
		data: undefined,
	};
}

export function actionRedirect(to: To, shouldThrow: false): void;
export function actionRedirect(to: To, shouldThrow?: true): never;
export function actionRedirect(to: To, shouldThrow = true): never {
	const c = UNSAFE_FrameworkContextStorage.getStore();
	assert(c, "No context available.");
	assert(!c[REDIRECT_SYMBOL], "Redirect already set.");

	c[REDIRECT_SYMBOL] = to;

	const error: Error & { $$typeof?: typeof REDIRECT_SYMBOL } = new Error(
		"framework.redirect",
	);
	error.$$typeof = REDIRECT_SYMBOL;
	throw error;
}

// biome-ignore lint/suspicious/noEmptyInterface: needed for type merging is userland.
export interface Cookies {}

// biome-ignore lint/suspicious/noEmptyInterface: needed for type merging is userland.
export interface UnsignedCookies {}

export type Cookie = {
	get<K extends keyof Cookies>(key: K, required?: false): null | Cookies[K];
	get<K extends keyof Cookies>(key: K, required: true): Cookies[K];
	getUnsigned<K extends keyof UnsignedCookies>(
		key: keyof UnsignedCookies,
		required?: false,
	): null | UnsignedCookies[K];
	getUnsigned<K extends keyof UnsignedCookies>(
		key: keyof UnsignedCookies,
		required: true,
	): UnsignedCookies[K];
	set<K extends keyof Cookies>(key: K, value: Cookies[K]): void;
	setUnsigned<K extends keyof UnsignedCookies>(
		key: K,
		value: UnsignedCookies[K],
	): void;
	unset<K extends keyof Cookies | keyof UnsignedCookies>(key: K): void;
};

export type ToObject = {
	pathname: string;
	search?: string;
};
export type To = string | ToObject;
