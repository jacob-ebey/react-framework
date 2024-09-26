import { AsyncLocalStorage } from "node:async_hooks";

// biome-ignore lint/suspicious/noExplicitAny: TODO - define RouteDefinition.
type RouteDefinition = any;

export interface NeutralServerEntry {
	fetch(request: Request): Response | Promise<Response>;
}

// biome-ignore lint/suspicious/noEmptyInterface: needed for type merging is userland.
export interface Environment {}

export type EnvironmentKeys = keyof Environment;

export type BlockConcurrencyWhile = <T>(
	callback: () => Promise<T>,
) => Promise<T>;

// biome-ignore lint/suspicious/noExplicitAny: better for everyone
export type WaitUntil = (promise: Promise<any>) => void;

export abstract class ServerEntry<Dependencies extends EnvironmentKeys>
	implements NeutralServerEntry
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
	waitUntil: WaitUntil;

	constructor() {
		const c = UNSAFE_FrameworkContextStorage.getStore();
		assert(c, "No context available.");
		assert(c.blockConcurrencyWhile, "No blockConcurrencyWhile available.");
		assert(c.durableId, "No durable ID available.");
		assert(c.storage, "Storage not available.");

		this.blockConcurrencyWhile = c.blockConcurrencyWhile;
		this.env = c.env;
		this.id = c.durableId;
		this.storage = c.storage;
		this.waitUntil = c.waitUntil;
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
	cookie: Cookie;
	durableId?: DurableId;
	env: Env;
	storage?: Storage;

	blockConcurrencyWhile?: <T>(callback: () => Promise<T>) => Promise<T>;
	// biome-ignore lint/suspicious/noExplicitAny: better for everyone
	waitUntil(promise: Promise<any>): void;
}

export interface Context<Env extends Partial<Environment> = Environment> {
	cookie: Cookie;
	env: Env;

	// biome-ignore lint/suspicious/noExplicitAny: better for everyone
	waitUntil(promise: Promise<any>): void;
}

export const UNSAFE_FrameworkContextStorage =
	new AsyncLocalStorage<FrameworkContext>();

function assertContext(c: FrameworkContext | undefined): asserts c is Context {
	assert(c, "No context available.");
	assert(c.cookie, "No cookie available.");
	assert(c.env, "No environments available.");
	assert(c.waitUntil, "No waitUntil available.");
}

export function getContext<
	Dependencies extends EnvironmentKeys = never,
>(): Context<PartialEnvironment<Dependencies>> {
	const c = UNSAFE_FrameworkContextStorage.getStore();
	assertContext(c);

	return c;
}

export async function handleRequest<
	TypeSafeRoutes extends readonly RouteDefinition[],
	Dependencies extends EnvironmentKeys,
>(
	request: Request,
	c: FrameworkContext<PartialEnvironment<Dependencies>>,
	routes: TypeSafeRoutes,
): Promise<Response> {
	return UNSAFE_FrameworkContextStorage.run(
		{
			cookie: c.cookie,
			env: c.env,
			storage: c.storage,
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

export function assert<T>(condition: T, message?: string): asserts condition {
	if (!condition) {
		throw new Error(message ?? "Assertion failed");
	}
}
