// biome-ignore lint/suspicious/noEmptyInterface: needed for type merging is userland.
export interface Environment {}

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

export interface Cookies {
	[key: string]: string;
}
export interface UnsignedCookies {
	[key: string]: string;
}

export type Cookie = {
	get<K extends keyof UnsignedCookies>(
		key: keyof UnsignedCookies,
	): null | UnsignedCookies[K];
	getSigned<K extends keyof Cookies>(key: K): null | Cookies[K];
	set<K extends keyof UnsignedCookies>(key: K, value: UnsignedCookies[K]): void;
	setSigned<K extends keyof Cookies>(key: K, value: Cookies[K]): void;
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

export type DurableConfig = {
	id: string;
	locationHint?: string;
};

export function getDurable<
	T extends Rpc.DurableObjectBranded | undefined = undefined,
>(): DurableObjectStub<T> {
	return {} as unknown as DurableObjectStub<T>;
}
