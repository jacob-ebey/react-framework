import { pathToFileURL } from "node:url";

import type * as astGrep from "@ast-grep/napi";

import { assert } from "framework/utils";

export type ServerEntryMeta = {
	name: string | null;
	dependencies: string[];
	className: string | null;
	exportedName: string | null;
};

export function extractServerEntries(
	node: astGrep.SgRoot,
	filename: string,
): ServerEntryMeta[] {
	const assertWithLocation: <T>(
		location: astGrep.SgNode,
		condition: T,
		message: string | (() => string),
	) => asserts condition = (location, condition, message) => {
		assert(condition, () =>
			[
				typeof message === "function" ? message() : message,

				`at ${location.text()} (${pathToFileURL(filename)}:${location.range().start.line}:${location.range().start.column})`,
			].join("\n    "),
		);
	};

	const root = node.root();
	const allMatches = root.findAll({
		rule: {
			kind: "extends_clause",
			has: {
				kind: "identifier",
				pattern: "ServerEntry",
			},
			inside: {
				kind: "class_heritage",
				inside: {
					any: [
						{
							kind: "class_declaration",
						},
						{
							kind: "class",
						},
					],
				},
			},
		},
	});
	const correctTypedMatches = root.findAll({
		utils: {
			isAllowedType: {
				any: [
					{
						kind: "predefined_type",
						regex: "^never$",
					},
					{
						kind: "type_identifier",
						regex: "^EnvironmentKeys$",
					},
					{
						kind: "literal_type",
						has: {
							kind: "string",
							has: {
								kind: "string_fragment",
							},
						},
					},
				],
			},
			isAllowedDepsType: {
				any: [
					{
						matches: "isAllowedType",
					},
					{
						kind: "union_type",
						has: {
							matches: "isAllowedType",
						},
					},
				],
			},
		},
		rule: {
			kind: "extends_clause",
			all: [
				{
					has: {
						kind: "identifier",
						pattern: "ServerEntry",
					},
				},
				{
					has: {
						kind: "type_arguments",
						all: [
							{
								has: {
									nthChild: 1,
									matches: "isAllowedType",
								},
							},
							{
								has: {
									nthChild: 2,
									matches: "isAllowedDepsType",
								},
							},
						],
					},
				},
			],
			inside: {
				kind: "class_heritage",
				inside: {
					any: [
						{
							kind: "class_declaration",
						},
						{
							kind: "class",
						},
					],
				},
			},
		},
	});
	const exportedMatches = root.findAll({
		rule: {
			any: [
				{
					kind: "export_statement",
					has: {
						kind: "identifier",
					},
				},
				{
					kind: "export_statement",
					has: {
						kind: "export_clause",
						has: {
							kind: "export_specifier",
							has: {
								kind: "identifier",
							},
						},
					},
				},
				{
					kind: "export_statement",
					has: {
						any: [
							{
								kind: "class",
							},
							{
								kind: "class_declaration",
								has: {
									kind: "class_heritage",
									has: {
										kind: "extends_clause",
										has: {
											kind: "identifier",
											pattern: "ServerEntry",
										},
									},
								},
							},
						],
					},
				},
			],
		},
	});

	const classNameToExportedName = new Map<string | null, string>();
	for (const match of exportedMatches) {
		const classNode = match.find({
			rule: { any: [{ kind: "class" }, { kind: "class_declaration" }] },
		});
		if (classNode) {
			switch (classNode.kind()) {
				case "class":
					classNameToExportedName.set(null, "default");
					break;
				case "class_declaration": {
					const identifierNode = classNode.find({
						rule: { kind: "type_identifier" },
					});
					assertWithLocation(
						classNode,
						identifierNode,
						"Expected to find a type identifier node.",
					);
					const identifier = identifierNode.text();
					assertWithLocation(
						classNode,
						identifier,
						"Expected to find a type identifier.",
					);
					classNameToExportedName.set(identifier, identifier);
					break;
				}
				default:
					throw new Error(`Unexpected class node kind "${classNode.kind()}"`);
			}
			continue;
		}

		const exportClause = match.find({
			rule: { kind: "export_clause" },
		});
		if (exportClause) {
			const exportSpecifiers = exportClause.findAll({
				rule: { kind: "export_specifier" },
			});
			for (const specifier of exportSpecifiers) {
				const children = specifier.children();

				if (children.length === 1) {
					const name = children[0].text();
					classNameToExportedName.set(name, name);
				} else if (children.length === 3) {
					const name = children[0].text();
					const exportedName = children[2].text();
					classNameToExportedName.set(name, exportedName);
				} else {
					assertWithLocation(
						specifier,
						false,
						"Unexpected export specifier node.",
					);
				}
			}

			continue;
		}

		const identifier = match.find({
			rule: { kind: "identifier" },
		});
		assertWithLocation(match, identifier, "Could not parse export identifier.");
		classNameToExportedName.set(identifier.text(), "default");
	}

	if (allMatches.length === 0 && correctTypedMatches.length === 0) {
		return [];
	}

	if (allMatches.length !== correctTypedMatches.length) {
		const goodRanges = new Set<string>(
			correctTypedMatches.map((match) => {
				const range = match.range();
				return `${range.start.line}:${range.start.column}`;
			}),
		);
		const badMatches = [];
		for (const match of allMatches) {
			const range = match.range();
			const key = `${range.start.line + 1}:${range.start.column + 1}`;
			if (!goodRanges.has(key)) {
				badMatches.push(
					`at ${match.text()} (${pathToFileURL(filename)}:${key})`,
				);
			}
		}
		const error = new Error(
			[
				"One or more ServerEntry's are not correctly typed.",
				...badMatches,
			].join("\n    "),
		);

		throw error;
	}

	return correctTypedMatches.map((match) => {
		const classHeritage = match.parent();
		assertWithLocation(
			match,
			classHeritage?.kind() === "class_heritage",
			"Expected to find a class heritage node.",
		);
		assertWithLocation(
			match,
			classHeritage,
			"Expected to find a parent for the type node.",
		);

		const classNode = classHeritage.parent();
		assertWithLocation(match, classNode, "Expected to find a class node.");

		let className = null;
		if (classNode.kind() === "class_declaration") {
			const typeIdentifier = classHeritage.prev();
			if (typeIdentifier?.kind() === "type_identifier") {
				className = typeIdentifier.text() || null;
			}
		}

		const args = match.find({
			rule: {
				kind: "type_arguments",
			},
		});
		assertWithLocation(match, args, "Expected to find type arguments");

		let name: string | null = null;
		const nameArg = args.child(1);
		assertWithLocation(match, nameArg, "Expected to find name type argument");
		switch (nameArg.kind()) {
			case "predefined_type":
				assert(
					nameArg.text() === "never",
					"Expected never type for Name in WorkerEntry<Name, Dependencies>",
				);
				break;
			case "literal_type": {
				const nameString = nameArg.child(0);
				assertWithLocation(
					match,
					nameString,
					"Expected to find string for Name in WorkerEntry<Name, Dependencies>",
				);
				const nameFragment = nameString.child(1);
				assertWithLocation(
					match,
					nameFragment,
					"Expected to find name string fragment for Name in WorkerEntry<Name, Dependencies>",
				);
				name = nameFragment.text();
				break;
			}
			default:
				assertWithLocation(
					match,
					false,
					"Unexpected type for Name in WorkerEntry<Name, Dependencies>",
				);
		}

		const dependencies: string[] = [];
		const depsArg = args.child(3);
		assertWithLocation(match, depsArg, "Expected to find deps type argument");
		switch (depsArg.kind()) {
			case "predefined_type":
				assertWithLocation(
					match,
					depsArg.text() === "never",
					"Expected never type for Dependencies in WorkerEntry<Name, Dependencies>",
				);
				break;
			case "type_identifier":
				break;
			case "literal_type": {
				const nameString = depsArg.child(0);
				assertWithLocation(
					match,
					nameString,
					"Expected to find string for Dependencies in WorkerEntry<Name, Dependencies>",
				);
				const nameFragment = nameString.child(1);
				assertWithLocation(
					match,
					nameFragment,
					"Expected to find name string fragment for Dependencies in WorkerEntry<Name, Dependencies>",
				);
				dependencies.push(nameFragment.text());
				break;
			}
			case "union_type": {
				for (const child of depsArg.children()) {
					switch (child.kind()) {
						case "|":
							continue;
						case "predefined_type":
							assertWithLocation(
								match,
								child.text() === "never",
								"Expected never type for Dependencies in WorkerEntry<Name, Dependencies>",
							);
							break;
						case "literal_type": {
							const nameString = child.child(0);
							assertWithLocation(
								match,
								nameString?.kind() === "string",
								"Expected to find string for Dependencies in WorkerEntry<Name, Dependencies>",
							);
							const nameFragment = nameString.child(1);
							assertWithLocation(
								match,
								nameFragment,
								"Expected to find name string fragment for Dependencies in WorkerEntry<Name, Dependencies>",
							);
							dependencies.push(nameFragment.text());
							break;
						}
						default:
							throw new Error(
								`Unexpected type "${child.kind()}" for Dependencies in WorkerEntry<Name, Dependencies>`,
							);
					}
				}
				break;
			}
			default:
				throw new Error(
					`Unexpected type "${depsArg.kind()}" for Dependencies in WorkerEntry<Name, Dependencies>`,
				);
		}

		return {
			name,
			dependencies,
			className,
			exportedName: classNameToExportedName.get(className) ?? null,
		};
	});
}

export type DurableEntryMeta = {
	name: string | null;
	dependencies: string[];
	className: string | null;
	exportedName: string | null;
};

export function extractDurableEntries(
	node: astGrep.SgRoot,
	filename: string,
): DurableEntryMeta[] {
	const assertWithLocation: <T>(
		location: astGrep.SgNode,
		condition: T,
		message: string | (() => string),
	) => asserts condition = (location, condition, message) => {
		assert(condition, () =>
			[
				typeof message === "function" ? message() : message,

				`at ${location.text()} (${pathToFileURL(filename)}:${location.range().start.line}:${location.range().start.column})`,
			].join("\n    "),
		);
	};

	const root = node.root();
	const allMatches = root.findAll({
		rule: {
			kind: "extends_clause",
			has: {
				kind: "identifier",
				pattern: "Durable",
			},
			inside: {
				kind: "class_heritage",
				inside: {
					any: [
						{
							kind: "class_declaration",
						},
						{
							kind: "class",
						},
					],
				},
			},
		},
	});
	const correctTypedMatches = root.findAll({
		utils: {
			isAllowedType: {
				any: [
					{
						kind: "predefined_type",
						regex: "^never$",
					},
					{
						kind: "type_identifier",
						regex: "^EnvironmentKeys$",
					},
					{
						kind: "literal_type",
						has: {
							kind: "string",
							has: {
								kind: "string_fragment",
							},
						},
					},
				],
			},
			isAllowedDepsType: {
				any: [
					{
						matches: "isAllowedType",
					},
					{
						kind: "union_type",
						has: {
							matches: "isAllowedType",
						},
					},
				],
			},
		},
		rule: {
			kind: "extends_clause",
			all: [
				{
					has: {
						kind: "identifier",
						pattern: "Durable",
					},
				},
				{
					has: {
						kind: "type_arguments",
						all: [
							{
								has: {
									nthChild: 1,
									matches: "isAllowedType",
								},
							},
							{
								has: {
									nthChild: 2,
									matches: "isAllowedDepsType",
								},
							},
						],
					},
				},
			],
			inside: {
				kind: "class_heritage",
				inside: {
					any: [
						{
							kind: "class_declaration",
						},
						{
							kind: "class",
						},
					],
				},
			},
		},
	});
	const exportedMatches = root.findAll({
		rule: {
			any: [
				{
					kind: "export_statement",
					has: {
						kind: "identifier",
					},
				},
				{
					kind: "export_statement",
					has: {
						kind: "export_clause",
						has: {
							kind: "export_specifier",
							has: {
								kind: "identifier",
							},
						},
					},
				},
				{
					kind: "export_statement",
					has: {
						any: [
							{
								kind: "class",
							},
							{
								kind: "class_declaration",
								has: {
									kind: "class_heritage",
									has: {
										kind: "extends_clause",
										has: {
											kind: "identifier",
											pattern: "Durable",
										},
									},
								},
							},
						],
					},
				},
			],
		},
	});

	const classNameToExportedName = new Map<string | null, string>();
	for (const match of exportedMatches) {
		const classNode = match.find({
			rule: { any: [{ kind: "class" }, { kind: "class_declaration" }] },
		});
		if (classNode) {
			switch (classNode.kind()) {
				case "class":
					classNameToExportedName.set(null, "default");
					break;
				case "class_declaration": {
					const identifierNode = classNode.find({
						rule: { kind: "type_identifier" },
					});
					assertWithLocation(
						classNode,
						identifierNode,
						"Expected to find a type identifier node.",
					);
					const identifier = identifierNode.text();
					assertWithLocation(
						classNode,
						identifier,
						"Expected to find a type identifier.",
					);
					classNameToExportedName.set(identifier, identifier);
					break;
				}
				default:
					throw new Error(`Unexpected class node kind "${classNode.kind()}"`);
			}
			continue;
		}

		const exportClause = match.find({
			rule: { kind: "export_clause" },
		});
		if (exportClause) {
			const exportSpecifiers = exportClause.findAll({
				rule: { kind: "export_specifier" },
			});
			for (const specifier of exportSpecifiers) {
				const children = specifier.children();

				if (children.length === 1) {
					const name = children[0].text();
					classNameToExportedName.set(name, name);
				} else if (children.length === 3) {
					const name = children[0].text();
					const exportedName = children[2].text();
					classNameToExportedName.set(name, exportedName);
				} else {
					assertWithLocation(
						specifier,
						false,
						"Unexpected export specifier node.",
					);
				}
			}

			continue;
		}

		const identifier = match.find({
			rule: { kind: "identifier" },
		});
		assertWithLocation(match, identifier, "Could not parse export identifier.");
		classNameToExportedName.set(identifier.text(), "default");
	}

	if (allMatches.length === 0 && correctTypedMatches.length === 0) {
		return [];
	}

	if (allMatches.length !== correctTypedMatches.length) {
		const goodRanges = new Set<string>(
			correctTypedMatches.map((match) => {
				const range = match.range();
				return `${range.start.line}:${range.start.column}`;
			}),
		);
		const badMatches = [];
		for (const match of allMatches) {
			const range = match.range();
			const key = `${range.start.line + 1}:${range.start.column + 1}`;
			if (!goodRanges.has(key)) {
				badMatches.push(
					`at ${match.text()} (${pathToFileURL(filename)}:${key})`,
				);
			}
		}
		const error = new Error(
			[
				"One or more Durables's are not correctly typed.",
				...badMatches,
			].join("\n    "),
		);

		throw error;
	}

	return correctTypedMatches.map((match) => {
		const classHeritage = match.parent();
		assertWithLocation(
			match,
			classHeritage?.kind() === "class_heritage",
			"Expected to find a class heritage node.",
		);
		assertWithLocation(
			match,
			classHeritage,
			"Expected to find a parent for the type node.",
		);

		const classNode = classHeritage.parent();
		assertWithLocation(match, classNode, "Expected to find a class node.");

		let className = null;
		if (classNode.kind() === "class_declaration") {
			const typeIdentifier = classHeritage.prev();
			if (typeIdentifier?.kind() === "type_identifier") {
				className = typeIdentifier.text() || null;
			}
		}

		const args = match.find({
			rule: {
				kind: "type_arguments",
			},
		});
		assertWithLocation(match, args, "Expected to find type arguments");

		let name: string | null = null;
		const nameArg = args.child(1);
		assertWithLocation(match, nameArg, "Expected to find name type argument");
		switch (nameArg.kind()) {
			case "predefined_type":
				assert(
					nameArg.text() === "never",
					"Expected never type for Name in WorkerEntry<Name, Dependencies>",
				);
				break;
			case "literal_type": {
				const nameString = nameArg.child(0);
				assertWithLocation(
					match,
					nameString,
					"Expected to find string for Name in WorkerEntry<Name, Dependencies>",
				);
				const nameFragment = nameString.child(1);
				assertWithLocation(
					match,
					nameFragment,
					"Expected to find name string fragment for Name in WorkerEntry<Name, Dependencies>",
				);
				name = nameFragment.text();
				break;
			}
			default:
				assertWithLocation(
					match,
					false,
					"Unexpected type for Name in WorkerEntry<Name, Dependencies>",
				);
		}

		const dependencies: string[] = [];
		const depsArg = args.child(3);
		assertWithLocation(match, depsArg, "Expected to find deps type argument");
		switch (depsArg.kind()) {
			case "predefined_type":
				assertWithLocation(
					match,
					depsArg.text() === "never",
					"Expected never type for Dependencies in WorkerEntry<Name, Dependencies>",
				);
				break;
			case "type_identifier":
				break;
			case "literal_type": {
				const nameString = depsArg.child(0);
				assertWithLocation(
					match,
					nameString,
					"Expected to find string for Dependencies in WorkerEntry<Name, Dependencies>",
				);
				const nameFragment = nameString.child(1);
				assertWithLocation(
					match,
					nameFragment,
					"Expected to find name string fragment for Dependencies in WorkerEntry<Name, Dependencies>",
				);
				dependencies.push(nameFragment.text());
				break;
			}
			case "union_type": {
				for (const child of depsArg.children()) {
					switch (child.kind()) {
						case "|":
							continue;
						case "predefined_type":
							assertWithLocation(
								match,
								child.text() === "never",
								"Expected never type for Dependencies in WorkerEntry<Name, Dependencies>",
							);
							break;
						case "literal_type": {
							const nameString = child.child(0);
							assertWithLocation(
								match,
								nameString?.kind() === "string",
								"Expected to find string for Dependencies in WorkerEntry<Name, Dependencies>",
							);
							const nameFragment = nameString.child(1);
							assertWithLocation(
								match,
								nameFragment,
								"Expected to find name string fragment for Dependencies in WorkerEntry<Name, Dependencies>",
							);
							dependencies.push(nameFragment.text());
							break;
						}
						default:
							throw new Error(
								`Unexpected type "${child.kind()}" for Dependencies in WorkerEntry<Name, Dependencies>`,
							);
					}
				}
				break;
			}
			default:
				throw new Error(
					`Unexpected type "${depsArg.kind()}" for Dependencies in WorkerEntry<Name, Dependencies>`,
				);
		}

		return {
			name,
			dependencies,
			className,
			exportedName: classNameToExportedName.get(className) ?? null,
		};
	});
}

export type ReactServerEntryMeta = {
	name: string | null;
	depedencies: string[];
};

export function extractReactServerEntry(
	node: astGrep.SgRoot,
	filename: string,
): ReactServerEntryMeta | null {
	const root = node.root();
	const typeDeclarationNode = root.find({
		utils: {
			isAllowedType: {
				any: [
					{
						kind: "predefined_type",
						regex: "^never$",
					},
					{
						kind: "type_identifier",
						regex: "^EnvironmentKeys$",
					},
					{
						kind: "literal_type",
						has: {
							kind: "string",
							has: {
								kind: "string_fragment",
							},
						},
					},
				],
			},
			isAllowedDepsType: {
				any: [
					{
						matches: "isAllowedType",
					},
					{
						kind: "union_type",
						has: {
							matches: "isAllowedType",
						},
					},
				],
			},
		},
		rule: {
			any: [
				{
					kind: "type_alias_declaration",
					pattern: "type Environment = $$$",
					inside: {
						kind: "export_statement",
					},
					has: {
						matches: "isAllowedDepsType",
					},
				},
			],
		},
	});

	if (!typeDeclarationNode) {
		return {
			name: null,
			depedencies: [],
		};
	}

	// TODO: Extract the dependencies from the type declaration. Use above logic.

	return {
		name: null,
		depedencies: [],
	};
}

export type ImportAttributeMeta = {
	importPath: string;
	type: string;
};

export function extractImportAttributes(
	node: astGrep.SgRoot,
): ImportAttributeMeta[] {
	const root = node.root();
	// TODO: Support static import statements
	const callExpresssions = root.findAll({
		rule: {
			any: [
				{
					kind: "call_expression",
					pattern: 'import("$$$", { with: { type: "service" } })',
				},
				{
					kind: "call_expression",
					pattern: 'import("$$$", { with: { type: "react-service" } })',
				},
			],
		},
	});

	const meta: ImportAttributeMeta[] = [];
	for (const callExpresssion of callExpresssions) {
		const stringNode = callExpresssion.find({
			rule: {
				kind: "string",
				nthChild: 1,
				inside: {
					kind: "arguments",
				},
			},
		});
		assert(stringNode, "Expected to find a string node");
		const stringFragmentNode = stringNode.child(1);
		assert(
			stringFragmentNode?.kind() === "string_fragment",
			"Expected to find a string fragment node",
		);
		const importPath = stringFragmentNode.text();

		const typeStringNode = callExpresssion.find({
			rule: {
				kind: "string",
				inside: {
					kind: "pair",
					has: {
						field: "key",
						regex: "^type$",
					},
				},
			},
		});
		assert(typeStringNode, "Expected to find a type string node");
		const typeStringFragmentNode = typeStringNode.child(1);
		assert(
			typeStringFragmentNode?.kind() === "string_fragment",
			"Expected to find a string fragment node",
		);
		const type = typeStringFragmentNode.text();

		meta.push({
			importPath,
			type,
		});
	}

	return meta;
}
