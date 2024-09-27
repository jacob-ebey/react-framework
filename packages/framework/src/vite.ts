import * as fsp from "node:fs/promises";
import * as path from "node:path";

import * as astGrep from "@ast-grep/napi";
import type * as vite from "vite";

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

export default function framework({
	cookieSecretKeys,
	entry,
	serviceBindingFactory,
}: UserConfig): vite.PluginOption[] {
	assert(entry, "entry is required");
	assert(serviceBindingFactory, "serviceBindingFactory is required");

	return [
		frameworkEyeball({ cookieSecretKeys, entry, serviceBindingFactory }),
		{
			name: "framework",
			config() {
				return {
					builder: {
						async buildApp(builder) {
							await builder.build(builder.environments.server);
						},
					},
					environments: {
						server: {
							build: {
								rollupOptions: {
									input: "framework/eyeball",
								},
							},
						},
					},
				};
			},
		},
	];
}

function frameworkEyeball({
	cookieSecretKeys,
	entry,
	serviceBindingFactory,
}: {
	cookieSecretKeys: undefined | string[];
	entry: string;
	serviceBindingFactory: string;
}): vite.Plugin {
	return {
		enforce: "pre",
		name: "framework:eyeball",
		async resolveId(id, importer, { attributes }) {
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
			if (id === "\0virtual:framework/eyeball") {
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

				let eyeballSource = await fsp.readFile(eyeballResolved.id, "utf-8");
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
				const filepath = id.slice(27);
				assert(fileExists(filepath), `${filepath} not found`);

				let [workerSource, workerMeta] = await Promise.all([
					this.resolve("framework/service", undefined, {
						skipSelf: true,
					}).then((workerResolved) => {
						assert(workerResolved, "framework/service not found");
						return fsp.readFile(workerResolved.id, "utf-8");
					}),
					fsp
						.readFile(filepath, "utf8")
						.then((source) => parseWorkerEntry(source, filepath)),
				]);

				workerSource = `import serviceBindingFactory from ${JSON.stringify(serviceBindingFactory)}\n${workerSource}`;
				workerSource = workerSource.replace(
					'"__SERVICE_BINDING_FACTORY_ARGS__"',
					JSON.stringify(workerMeta),
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

function frameworkDurable({
	storage,
}: { storage: StorageConfig }): vite.Plugin {
	return {
		enforce: "pre",
		name: "framework:durable",
	};
}

async function parseWorkerEntry(source: string, filename: string) {
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
	assert(allServers.length === 1, "expected exactly one ServerEntry");
	const serverTypeNode = allServers[0];
	let name = serverTypeNode.text();
	name =
		name === "never" ? `${filepathToBindingName(filename, ext)}_EYEBALL` : name;

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
	assert(allDependencies.length === 1, "expected exactly one ServerEntry");
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

	return { name, dependencies };
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
