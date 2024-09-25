export interface ExecutionContext {
	// biome-ignore lint/suspicious/noExplicitAny: better for everyone
	waitUntil(promise: Promise<any>): void;
	passThroughOnException(): void;
}

export interface NeutralServerEntry {
	fetch(request: Request): Response | Promise<Response>;
}

// biome-ignore lint/suspicious/noEmptyInterface: needed for type merging is userland.
export interface Environment {}

export abstract class ServerEntry<Env = Environment>
	implements NeutralServerEntry
{
	constructor(
		protected ctx: ExecutionContext,
		protected env: Env,
	) {}
	abstract fetch(request: Request): Response | Promise<Response>;
}

// biome-ignore lint/suspicious/noExplicitAny: TODO - define RouteDefinition.
type RouteDefinition = any;

export async function handleRequest<
	TypeSafeRoutes extends readonly RouteDefinition[],
>(
	request: Request,
	env: Environment,
	ctx: ExecutionContext,
	routes: TypeSafeRoutes,
): Promise<Response> {
	return new Response("Hello, World!");
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

export type Context = {
	env: Environment;
	cookie: Cookie;
	redirect(to: To): never;
};

export function getContext(): Context {
	return {} as unknown as Context;
}

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
