import * as fsp from "node:fs/promises";
import * as path from "node:path";

import * as astGrep from "@ast-grep/napi";
import * as vite from "vite";

import type { ServiceBindingFactoryMeta } from "framework";
import type { BuildMeta, BindingsMeta } from "framework/build-meta";
import { assert } from "framework/utils";

export type StorageConfig = {
	package: string;
	config: Record<string, unknown>;
};

export type UserConfig = {
	cookieSecretKeys?: string[];
	entry: string;
	serviceBindingFactory: string;
};

class Deferred<T> {
	resolve!: (value: T | PromiseLike<T>) => void;
	reject!: (reason?: unknown) => void;
	promise = new Promise<T>((resolve, reject) => {
		this.resolve = resolve;
		this.reject = reject;
	});
}

declare global {
	var initializePromise: Promise<void> | undefined;
}

type PluginContext = {
	bindingMeta: BindingsMeta;
	cookieSecretKeys: undefined | string[];
	entry: string;
	serviceBindingFactory: string;
	buildMetaPromise: Deferred<BuildMeta>;
};

let __CONTEXT__: PluginContext;

export default function framework({
	cookieSecretKeys,
	entry,
	serviceBindingFactory,
}: UserConfig): vite.PluginOption[] {
	assert(entry, "entry is required");
	assert(serviceBindingFactory, "serviceBindingFactory is required");

	const context =
		__CONTEXT__ ??
		// biome-ignore lint/suspicious/noAssignInExpressions: why u no like dis?
		(__CONTEXT__ = {
			bindingMeta: {},
			cookieSecretKeys,
			buildMetaPromise: new Deferred<BuildMeta>(),
			serviceBindingFactory,
		} satisfies Omit<PluginContext, "entry"> as PluginContext);

	async function initialize(
		mode: "dev" | "build" | "unknown",
		resolve: ResolveFunction,
	) {
		const entryResolved = await cachedResolve(resolve, entry);
		assert(entryResolved?.id, `could not resolve entry ${entry}`);
		context.entry = entryResolved.id;

		if (mode !== "build") {
			context.buildMetaPromise.promise.catch(() => {});
			context.buildMetaPromise.reject(
				new Error("can not import framework/build-meta outside of build mode"),
			);
		}
	}

	return [
		{
			name: "framework:setup",
			enforce: "pre",
			async load() {
				if (!global.initializePromise) {
					global.initializePromise = initialize(
						this.environment.mode,
						this.resolve,
					);
				}
				await global.initializePromise;
			},
		},
		frameworkEyeball(context),
		frameworkBuildMeta(context),
		{
			name: "framework",
			async watchChange(id, { event }) {
				const resolvedEntry = await cachedResolve(this.resolve, entry);
				assert(resolvedEntry, `could not resolve entry ${id}`);

				if (id === resolvedEntry.id) {
					switch (event) {
						case "create":
							break;
						case "delete":
							break;
						case "update":
							break;
					}
				}
			},
			config(userConfig) {
				return vite.mergeConfig(
					{
						builder: {
							async buildApp(builder) {
								await builder.build(builder.environments.ssr);
								await builder.build(builder.environments.meta);
							},
						},
						build: {
							outDir: "dist/eyeball",
						},
						environments: {
							ssr: {
								build: {
									rollupOptions: {
										input: "framework/eyeball",
									},
								},
							},
							meta: {
								build: {
									outDir: "dist/meta",
									rollupOptions: {
										input: "framework/build-meta",
									},
								},
							},
						},
					} satisfies vite.UserConfig,
					userConfig,
				);
			},
		},
	];
}

function frameworkEyeball(context: PluginContext): vite.Plugin {
	return {
		enforce: "pre",
		name: "framework:eyeball",
		async resolveId(id, importer, { attributes }) {
			const { entry } = context;

			if (this.environment.name !== "ssr") return;
			if (entry && importer !== entry) return;

			if (id === "framework/eyeball") {
				return "\0virtual:framework/eyeball";
			}

			if (
				attributes.type === "service" ||
				attributes.type === "react-service"
			) {
				const resolved = await this.resolve(id, importer, {
					skipSelf: true,
				});
				assert(
					resolved?.id,
					`could not resolve ${id} from ${importer || "entry"}`,
				);

				return `\0virtual:framework/${attributes.type}:${resolved.id}`;
			}
		},
		async load(id) {
			if (this.environment.name !== "ssr") return;

			if (id === "\0virtual:framework/eyeball") {
				const { cookieSecretKeys, entry } = context;
				assert(entry, "plugin not initialized");

				const [eyeballResolved, entryResolved] = await Promise.all([
					this.resolve("framework/eyeball", undefined, {
						skipSelf: true,
					}),
					this.resolve(entry, undefined, {
						skipSelf: true,
					}),
				]);
				assert(eyeballResolved?.id, "framework/eyeball not found");
				assert(entryResolved?.id, `${entry} not found`);

				let eyeballSource = await fsp.readFile(eyeballResolved.id, "utf8");
				eyeballSource = `import EyeballEntry from ${JSON.stringify(entryResolved.id)};\n${eyeballSource}`;
				if (cookieSecretKeys) {
					eyeballSource = eyeballSource.replace(
						'"COOKIE_SECRET"',
						JSON.stringify(cookieSecretKeys).slice(1, -1),
					);
				}

				return eyeballSource;
			}

			if (id.startsWith("\0virtual:framework/service:")) {
				const { bindingMeta, serviceBindingFactory } = context;
				const filepath = id.slice(27);
				assert(fileExists(filepath), `${filepath} not found`);

				let [workerSource, workerMeta] = await Promise.all([
					this.resolve("framework/service", undefined, {
						skipSelf: true,
					}).then((workerResolved) => {
						assert(workerResolved, "framework/service not found");
						return fsp.readFile(workerResolved.id, "utf8");
					}),
					fsp.readFile(filepath, "utf8").then(async (source) => {
						const meta = await parseServerTypes(source, filepath);
						assert(meta.length === 1, "expected exactly one ServerEntry");
						return meta[0];
					}),
				]);

				assert(bindingMeta, "plugin not initialized");
				const binding = bindingMeta[workerMeta.name] ?? [];
				binding.push(...workerMeta.dependencies);
				bindingMeta[workerMeta.name] = binding;

				const meta: ServiceBindingFactoryMeta = {
					name: workerMeta.name,
				};

				workerSource = `import serviceBindingFactory from ${JSON.stringify(serviceBindingFactory)}\n${workerSource}`;
				workerSource = workerSource.replace(
					'"__SERVICE_BINDING_FACTORY_ARGS__"',
					JSON.stringify(meta),
				);

				return workerSource;
			}

			if (id.startsWith("\0virtual:framework/react-service:")) {
				const filepath = id.slice(34);
				assert(fileExists(filepath), `${filepath} not found`);

				return `export default "Hello, React Service!";`;
			}
		},
	};
}

function frameworkBuildMeta(context: PluginContext): vite.Plugin {
	return {
		enforce: "pre",
		name: "framework:build-meta",
		async closeBundle() {
			if (this.environment.name !== "ssr") return;
			console.log("closing bundle");
			const { buildMetaPromise } = context;
			assert(buildMetaPromise, "plugin not initialized");
			const bindings: BindingsMeta = {};
			for (const [name, dependencies] of Object.entries(context.bindingMeta)) {
				bindings[name] = Array.from(new Set(dependencies));
			}
			buildMetaPromise.resolve({ bindings });
		},
		async resolveId(id) {
			if (this.environment.name !== "meta") return;

			if (id === "framework/build-meta") {
				return "\0virtual:framework/build-meta";
			}
		},
		async load(id) {
			if (this.environment.name !== "meta") return;

			if (id === "\0virtual:framework/build-meta") {
				const { buildMetaPromise } = context;
				assert(buildMetaPromise, "plugin not initialized");
				const buildMeta = await buildMetaPromise.promise;

				return `export default ${JSON.stringify(buildMeta)};`;
			}
		},
	};
}

function frameworkDurable({
	storage,
}: { storage: StorageConfig }): vite.Plugin {
	return {
		enforce: "pre",
		name: "framework:durable",
	};
}

export type BindingMeta = {
	name: string;
	dependencies: string[];
};

async function parseServerTypes(
	source: string,
	filename: string,
): Promise<BindingMeta[]> {
	const ext = path.extname(filename);
	const parsed = await astGrep.parseAsync(
		(ext === ".tsx" ? "Tsx" : "TypeScript") as unknown as astGrep.Lang,
		source,
	);
	const allServers = parsed.root().findAll({
		rule: {
			any: [
				{
					kind: "string_fragment",
					inside: {
						kind: "string",
						inside: {
							kind: "literal_type",
							nthChild: 1,
							inside: {
								kind: "type_arguments",
								follows: {
									kind: "identifier",
									pattern: "ServerEntry",
								},
							},
						},
					},
				},
				{
					kind: "predefined_type",
					nthChild: 1,
					inside: {
						kind: "type_arguments",
						follows: {
							kind: "identifier",
							pattern: "ServerEntry",
						},
					},
				},
			],
		},
	});

	const allDependencies = parsed.root().findAll({
		rule: {
			any: [
				{
					kind: "string_fragment",
					inside: {
						kind: "string",
						inside: {
							kind: "literal_type",
							nthChild: 2,
							inside: {
								kind: "type_arguments",
								follows: {
									kind: "identifier",
									pattern: "ServerEntry",
								},
							},
						},
					},
				},
				{
					kind: "union_type",
					inside: {
						kind: "type_arguments",
						follow: {
							kind: "identifier",
							pattern: "ServerEntry",
						},
					},
				},
				{
					kind: "predefined_type",
					nthChild: 2,
					inside: {
						kind: "type_arguments",
						follows: {
							kind: "identifier",
							pattern: "ServerEntry",
						},
					},
				},
			],
		},
	});

	assert(
		allServers.length === allDependencies.length,
		"one or more ServerEntry generics are misconfigured",
	);

	const meta: BindingMeta[] = [];
	for (let i = 0; i < allServers.length; i++) {
		const serverTypeNode = allServers[0];
		let name = serverTypeNode.text();
		name =
			name === "never"
				? `${filepathToBindingName(filename, ext)}_SERVICE`
				: name;

		const dependencyTypeNode = allDependencies[0];
		const dependencies: string[] = [];
		switch (dependencyTypeNode.kind()) {
			case "string_fragment":
				dependencies.push(dependencyTypeNode.text());
				break;
			case "predefined_type":
				assert(
					dependencyTypeNode.text() === "never",
					`expected never or string, got ${dependencyTypeNode.kind()}`,
				);
				break;
			case "union_type":
				for (const child of dependencyTypeNode.children()) {
					if (child.kind() !== "literal_type") continue;
					const stringNode = child.find({ rule: { kind: "string_fragment" } });
					assert(
						stringNode?.kind() === "string_fragment",
						`expected never or string, got ${stringNode?.kind()}`,
					);

					dependencies.push(stringNode.text());
				}
				break;
			default:
				throw new Error(
					`Unexpected ServerEntry dependency kind ${dependencyTypeNode.kind()}`,
				);
		}

		meta.push({ name, dependencies });
	}

	return meta;
}

type ResolveFunction = (
	source: string,
	importer?: string,
	options?: {
		attributes?: Record<string, string>;
		custom?: vite.Rollup.CustomPluginOptions;
		isEntry?: boolean;
		skipSelf?: boolean;
	},
) => Promise<vite.Rollup.ResolvedId | null>;

const resolveCache = new Map<string, vite.Rollup.ResolvedId>();
function cachedResolve<T>(
	resolve: ResolveFunction,
	source: string,
	importer?: string,
) {
	const id = `${source}||${importer ?? ""}`;
	const cached = resolveCache.get(id);
	if (cached) {
		return Promise.resolve(cached);
	}

	return resolve(source, importer, { skipSelf: true }).then((resolved) => {
		if (resolved) resolveCache.set(id, resolved);
		return resolved;
	});
}

function fileExists(filepath: string) {
	return fsp
		.stat(filepath)
		.then((s) => s.isFile())
		.catch(() => false);
}

function filepathToBindingName(filepath: string, ext: string) {
	const base = path.basename(filepath, ext ?? path.extname(filepath));
	console.log({ filepath, base });
	const binding = base
		.replace(/[^A-Z0-9]/gi, "_")
		.toUpperCase()
		.trim();
	assert(binding, `could not convert ${filepath} to binding name`);
	return binding;
}
