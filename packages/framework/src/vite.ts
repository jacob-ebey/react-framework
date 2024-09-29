import * as fsp from "node:fs/promises";
import * as path from "node:path";

import * as astGrep from "@ast-grep/napi";
import * as vite from "vite";

import type { BindingsMeta, BuildMeta } from "framework/virtual/build-meta";
import { assert } from "framework/utils";
import {
	extractImportAttributes,
	extractDurableEntries,
	extractReactServerEntry,
	extractServerEntries,
} from "framework/compiler";

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
	environmentDependencies: Record<string, Set<string>>;
	cookieSecretKeys: undefined | string[];
	entry: string;
	services: Record<string, string[]>;
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
			environmentDependencies: {},
			cookieSecretKeys,
			buildMetaPromise: new Deferred<BuildMeta>(),
			services: {},
			serviceBindingFactory,
		} satisfies Omit<PluginContext, "entry"> as PluginContext);

	async function initialize(mode: string, root: string) {
		console.log({ mode });
		const entryResolved = path.resolve(root, entry);
		const entryDir = path.dirname(entryResolved);
		assert(fileExists(entryResolved), `could not resolve entry ${entry}`);
		context.entry = entryResolved;

		const contents = await fsp.readFile(entryResolved, "utf8");
		const ext = path.extname(entryResolved);
		const ast = await astGrep.parseAsync(
			(ext === ".tsx" ? "Tsx" : "TypeScript") as unknown as astGrep.Lang,
			contents,
		);

		// TODO: Move initialize function to be called from the the "config()" hook
		// and create environments for each service defined in the entry file by
		// import attributes.
		const importAttributesMeta = extractImportAttributes(ast);
		for (const meta of importAttributesMeta) {
			context.services[meta.type] ??= [];
			context.services[meta.type].push(path.resolve(entryDir, meta.importPath));
		}

		if (mode !== "production") {
			context.buildMetaPromise.promise.catch(() => {});
			context.buildMetaPromise.reject(
				new Error(
					"can not import framework/virtual/build-meta outside of build mode",
				),
			);
		}
	}

	let initialized = false;
	return [
		{
			name: "framework:setup",
			enforce: "pre",
			async config({ builder: userBuilder, ...userConfig }, { mode }) {
				if (initialized) return;
				if (!global.initializePromise) {
					global.initializePromise = initialize(
						userConfig.mode ?? mode,
						userConfig.root ?? process.cwd(),
					);
				}
				await global.initializePromise;
				initialized = true;

				const { services } = context;
				assert(services, "plugin not initialized");

				return vite.mergeConfig(
					{
						builder: {
							async buildApp(builder) {
								await builder.build(builder.environments.ssr);

								await Promise.all([
									...(services.service ?? []).map((_, i) =>
										builder.build(builder.environments[`SERVICE_${i}`]),
									),
									...(services["react-service"] ?? []).map((_, i) =>
										builder.build(builder.environments[`REACT_SERVICE_${i}`]),
									),
								]);

								if (userBuilder?.buildApp) {
									await userBuilder.buildApp(builder);
								}

								const { buildMetaPromise, environmentDependencies } = context;
								assert(
									buildMetaPromise && environmentDependencies,
									"plugin not initialized",
								);

								const bindings: BindingsMeta = {};
								for (const [name, dependencies] of Object.entries(
									environmentDependencies,
								)) {
									bindings[name] = Array.from(dependencies);
								}
								buildMetaPromise.resolve({ bindings });

								await builder.build(builder.environments.meta);
							},
						},
						build: {
							outDir: "dist/eyeball",
						},
						environments: vite.mergeConfig<
							Record<string, vite.EnvironmentOptions>,
							Record<string, vite.EnvironmentOptions>
						>(
							{
								ssr: {
									build: {
										rollupOptions: {
											input: "framework/virtual/eyeball",
										},
									},
								},
								meta: {
									build: {
										outDir: "dist/meta",
										rollupOptions: {
											input: "framework/virtual/build-meta",
										},
									},
								},
							},
							vite.mergeConfig<
								Record<string, vite.EnvironmentOptions>,
								Record<string, vite.EnvironmentOptions>
							>(
								Object.fromEntries(
									(services.service ?? []).map((service, i) => [
										`SERVICE_${i}`,
										{
											build: {
												outDir: `dist/services/${i}`,
												rollupOptions: {
													// TODO: This is gross
													input: service.replace(/\.[jt]sx?$/, ""),
												},
											},
										} satisfies vite.EnvironmentOptions,
									]),
								),
								Object.fromEntries(
									(services["react-service"] ?? []).map((service, i) => [
										`REACT_SERVICE_${i}`,
										{
											build: {
												outDir: `dist/react-services/${i}`,
												rollupOptions: {
													// TODO: This is gross
													input: service.replace(/\.[jt]sx?$/, ""),
												},
											},
										} satisfies vite.EnvironmentOptions,
									]),
								),
								false,
							),
							false,
						),
					} satisfies vite.UserConfig,
					userConfig,
					true,
				);
			},
		},
		eyeball(context),
		services(context),
		reactServices(context),
		dependencies(context),
		frameworkBuildMeta(context),
		// {
		// 	name: "framework",
		// 	async watchChange(id, { event }) {
		// 		const resolvedEntry = await cachedResolve(this.resolve, entry);
		// 		assert(resolvedEntry, `could not resolve entry ${id}`);

		// 		if (id === resolvedEntry.id) {
		// 			switch (event) {
		// 				case "create":
		// 					break;
		// 				case "delete":
		// 					break;
		// 				case "update":
		// 					break;
		// 			}
		// 		}
		// 	},
		// },
	];
}

function eyeball(context: PluginContext): vite.Plugin {
	return {
		name: "framework:eyeball",
		enforce: "pre",
		async resolveId(id, importer, { attributes }) {
			if (this.environment.name !== "ssr") return;

			if (id === "framework/virtual/eyeball") {
				return "\0virtual:framework/virtual/eyeball";
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

				return `\0virtual:framework/virtual/${attributes.type}-binding:${resolved.id}`;
			}
		},
		async load(id) {
			if (id === "\0virtual:framework/virtual/eyeball") {
				const { cookieSecretKeys, entry } = context;
				assert(entry, "plugin not initialized");

				const [eyeballResolved, entryResolved] = await Promise.all([
					this.resolve("framework/virtual/eyeball", undefined, {
						skipSelf: true,
					}),
					this.resolve(entry, undefined, {
						skipSelf: true,
					}),
				]);
				assert(eyeballResolved?.id, "framework/virtual/eyeball not found");
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
		},
	};
}

function services(context: PluginContext): vite.Plugin {
	return {
		name: "framework:services",
		async load(id) {
			if (id.startsWith("\0virtual:framework/virtual/service-binding:")) {
				const { serviceBindingFactory } = context;
				assert(serviceBindingFactory, "plugin not initialized");

				const filepath = id.slice(43);
				assert(fileExists(filepath), `${filepath} not found`);

				let [workerSource, meta] = await Promise.all([
					this.resolve("framework/virtual/service-binding", undefined, {
						skipSelf: true,
					}).then((workerResolved) => {
						assert(
							workerResolved?.id,
							"framework/virtual/service-binding not found",
						);
						return fsp.readFile(workerResolved.id, "utf8");
					}),
					fsp.readFile(filepath, "utf8").then(async (source) => {
						const ext = path.extname(filepath);
						const ast = await astGrep.parseAsync(
							(ext === ".tsx"
								? "Tsx"
								: "TypeScript") as unknown as astGrep.Lang,
							source,
						);

						const entries = await extractServerEntries(ast, filepath);
						const defaultEntry = entries.find(
							(entry) => entry.exportedName === "default",
						);
						assert(
							defaultEntry,
							"expected a ServerEntry to be exported as default",
						);
						const entry = entries[0];
						return {
							name: entry.name ?? filepathToBindingName(filepath, ext),
						};
					}),
				]);

				workerSource = `import serviceBindingFactory from ${JSON.stringify(serviceBindingFactory)};\n${workerSource}`;
				workerSource = workerSource.replace(
					'"__SERVICE_BINDING_FACTORY_ARGS__"',
					JSON.stringify(meta),
				);

				return workerSource;
			}
		},
	};
}

function reactServices(context: PluginContext): vite.Plugin {
	return {
		name: "framework:react-services",
		async load(id) {
			if (id.startsWith("\0virtual:framework/virtual/react-service-binding:")) {
				const { serviceBindingFactory } = context;
				assert(serviceBindingFactory, "plugin not initialized");

				const filepath = id.slice(49);
				assert(fileExists(filepath), `${filepath} not found`);

				let [workerSource, meta] = await Promise.all([
					this.resolve("framework/virtual/react-service-binding", undefined, {
						skipSelf: true,
					}).then((workerResolved) => {
						assert(
							workerResolved?.id,
							"framework/virtual/react-service-binding not found",
						);
						return fsp.readFile(workerResolved.id, "utf8");
					}),
					fsp.readFile(filepath, "utf8").then(async (source) => {
						const ext = path.extname(filepath);
						const ast = await astGrep.parseAsync(
							(ext === ".tsx"
								? "Tsx"
								: "TypeScript") as unknown as astGrep.Lang,
							source,
						);

						const entry = await extractReactServerEntry(ast, filepath);
						assert(
							entry,
							`could not parse react server entry from file ${filepath}`,
						);
						return {
							name: entry.name ?? filepathToBindingName(filepath, ext),
						};
					}),
				]);

				workerSource = `import serviceBindingFactory from ${JSON.stringify(serviceBindingFactory)};\n${workerSource}`;
				workerSource = workerSource.replace(
					'"__SERVICE_BINDING_FACTORY_ARGS__"',
					JSON.stringify(meta),
				);

				return workerSource;
			}
		},
	};
}

function dependencies(context: PluginContext): vite.Plugin {
	return {
		name: "framework:dependencies",
		enforce: "pre",
		async transform(code, id) {
			const { environmentDependencies } = context;
			assert(environmentDependencies, "plugin not initialized");

			const ext = path.extname(id);
			if ((ext !== ".ts" && ext !== ".tsx") || !fileExists(id)) return;

			const ast = await astGrep.parseAsync(
				(ext === ".ts" ? "TypeScript" : "Tsx") as unknown as astGrep.Lang,
				code,
			);

			try {
				const serverEntries = await extractServerEntries(ast, id);
				const durableEntries = await extractDurableEntries(ast, id);
				console.log({ id, env: this.environment.name, durableEntries });
				const entries = [...serverEntries, ...durableEntries];
				// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
				const deps = (environmentDependencies[this.environment.name] ??=
					new Set());
				for (const entry of entries) {
					for (const dep of entry.dependencies) {
						deps.add(dep);
					}
				}
				console.log(environmentDependencies);
			} catch (reason) {}
		},
	};
}

function frameworkBuildMeta(context: PluginContext): vite.Plugin {
	return {
		enforce: "pre",
		name: "framework:build-meta",
		async resolveId(id) {
			if (this.environment.name !== "meta") return;

			if (id === "framework/virtual/build-meta") {
				return "\0virtual:framework/virtual/build-meta";
			}
		},
		async load(id) {
			if (this.environment.name !== "meta") return;

			if (id === "\0virtual:framework/virtual/build-meta") {
				const { buildMetaPromise } = context;
				assert(buildMetaPromise, "plugin not initialized");
				const buildMeta = await buildMetaPromise.promise;

				return `export default ${JSON.stringify(buildMeta)};`;
			}
		},
	};
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

function fileExists(filepath: string) {
	return fsp
		.stat(filepath)
		.then((s) => s.isFile())
		.catch(() => false);
}

function filepathToBindingName(filepath: string, ext: string) {
	const base = path.basename(filepath, ext ?? path.extname(filepath));
	const binding = base
		.replace(/[^A-Z0-9]/gi, "_")
		.toUpperCase()
		.trim();
	assert(binding, `could not convert ${filepath} to binding name`);
	return binding;
}
