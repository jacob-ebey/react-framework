import { AsyncLocalStorage } from "node:async_hooks";

// biome-ignore lint/suspicious/noExplicitAny: TODO - define RouteDefinition.
type RouteDefinition = any;

export interface NeutralServerEntry {
	fetch(request: Request): Response | Promise<Response>;
}

// biome-ignore lint/suspicious/noEmptyInterface: needed for type merging is userland.
export interface Environment {}

export type EnvironmentKeys = keyof Environment;

export abstract class ServerEntry<Keys extends EnvironmentKeys>
	implements NeutralServerEntry
{
	env: PartialEnvironment<Keys>;
	cookie: Cookie;
	redirect: (to: To) => never;
	// biome-ignore lint/suspicious/noExplicitAny: better for everyone
	waitUntil: (promise: Promise<any>) => void;

	constructor() {
		const c = getContext<Keys>();
		this.env = c.env;
		this.cookie = c.cookie;
		this.redirect = c.redirect;
		this.waitUntil = c.waitUntil;
	}
	abstract fetch(request: Request): Response | Promise<Response>;
}

export type PartialEnvironment<Keys extends EnvironmentKeys> = {
	[K in Keys]: K extends keyof Environment ? Environment[K] : never;
};

export type Context<Env extends Partial<Environment> = Environment> = {
	env: Env;
	cookie: Cookie;
	redirect(to: To): never;
	// biome-ignore lint/suspicious/noExplicitAny: better for everyone
	waitUntil(promise: Promise<any>): void;
};

export const UNSAFE_ContextStorage = new AsyncLocalStorage<Context>();

export function getContext<Keys extends EnvironmentKeys>(): Context<
	PartialEnvironment<Keys>
> {
	const c = UNSAFE_ContextStorage.getStore();
	assert(c, "No context available.");
	return c as Context<PartialEnvironment<Keys>>;
}

export async function handleRequest<
	TypeSafeRoutes extends readonly RouteDefinition[],
	Keys extends EnvironmentKeys,
>(
	request: Request,
	c: Context<PartialEnvironment<Keys>>,
	routes: TypeSafeRoutes,
): Promise<Response> {
	return UNSAFE_ContextStorage.run(
		{
			cookie: c.cookie,
			env: c.env,
			redirect: c.redirect,
			waitUntil: c.waitUntil,
		},
		async () => {
			return new Response("Hello, World!");
		},
	);
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

export function assert<T>(condition: T, message?: string): asserts condition {
	if (!condition) {
		throw new Error(message ?? "Assertion failed");
	}
}
