import { describe, test } from "node:test";
import * as assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import * as astGrep from "@ast-grep/napi";

import { extractServerEntries } from "./compiler.js";

const __filename = fileURLToPath(import.meta.url);

function shouldThrowAsync(
	fn: () => Promise<unknown>,
	expected: string | RegExp,
) {
	return async () => {
		try {
			await fn();
			assert.fail("Expected an error");
		} catch (error) {
			assert.strictEqual(
				typeof expected === "string"
					? (error as Error).message.includes(expected)
					: !!(error as Error).message.match(expected),
				true,
				`Expected \`${(error as Error).message}\` to match \`${expected}\``,
			);
		}
	};
}

async function extract(source: string) {
	const parsed = await astGrep.parseAsync("TypeScript" as astGrep.Lang, source);
	return extractServerEntries(parsed, __filename);
}

describe("extractServerEntries", () => {
	describe("success", () => {
		test("should extract a single server entry <never, never>", async () => {
			const extracted = await extract(`
        export default class extends ServerEntry<never, never> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: null,
					exportedName: "default",
					name: null,
					dependencies: [],
				},
			]);
		});

		test("should extract a single server entry <never, never> with class name", async () => {
			const extracted = await extract(`
        export class MyClass extends ServerEntry<never, never> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: "MyClass",
					exportedName: "MyClass",
					name: null,
					dependencies: [],
				},
			]);
		});

		test("should extract a single server entry <never, string>", async () => {
			const extracted = await extract(`
        export default class extends ServerEntry<never, 'DEP'> {
        }
      `);
			assert.deepStrictEqual(extracted, [
				{
					className: null,
					exportedName: "default",
					name: null,
					dependencies: ["DEP"],
				},
			]);
		});

		test("should extract a single server entry <never, string> with class name", async () => {
			const extracted = await extract(`
        export class MyClass extends ServerEntry<never, 'DEP'> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: "MyClass",
					exportedName: "MyClass",
					name: null,
					dependencies: ["DEP"],
				},
			]);
		});

		test("should extract a single server entry <string, never>", async () => {
			const extracted = await extract(`
        export default class extends ServerEntry<'NAME', never> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: null,
					exportedName: "default",
					name: "NAME",
					dependencies: [],
				},
			]);
		});

		test("should extract a single server entry <string, never> with class name", async () => {
			const extracted = await extract(`
        export class MyClass extends ServerEntry<'NAME', never> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: "MyClass",
					exportedName: "MyClass",
					name: "NAME",
					dependencies: [],
				},
			]);
		});

		test("should extract a single server entry <string, string>", async () => {
			const extracted = await extract(`
        export default class extends ServerEntry<'NAME', 'DEP'> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: null,
					exportedName: "default",
					name: "NAME",
					dependencies: ["DEP"],
				},
			]);
		});

		test("should extract a single server entry <string, string> with class name", async () => {
			const extracted = await extract(`
        export class MyClass extends ServerEntry<'NAME', 'DEP'> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: "MyClass",
					exportedName: "MyClass",
					name: "NAME",
					dependencies: ["DEP"],
				},
			]);
		});

		test("should extract a single server entry <string, string | string>", async () => {
			const extracted = await extract(`
        export default class extends ServerEntry<'NAME', 'DEP1' | 'DEP2'> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: null,
					exportedName: "default",
					name: "NAME",
					dependencies: ["DEP1", "DEP2"],
				},
			]);
		});

		test("should extract multiple server entries", async () => {
			const extracted = await extract(`
        export class MyClass1 extends ServerEntry<'NAME1', 'DEP1'> {
        }
        export class MyClass2 extends ServerEntry<'NAME2', 'DEP2'> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: "MyClass1",
					exportedName: "MyClass1",
					name: "NAME1",
					dependencies: ["DEP1"],
				},
				{
					className: "MyClass2",
					exportedName: "MyClass2",
					name: "NAME2",
					dependencies: ["DEP2"],
				},
			]);
		});

		test("should extract multiple server entries without export", async () => {
			const extracted = await extract(`
        class MyClass1 extends ServerEntry<'NAME1', 'DEP1'> {
        }
        export class MyClass2 extends ServerEntry<'NAME2', 'DEP2'> {
        }
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: "MyClass1",
					exportedName: null,
					name: "NAME1",
					dependencies: ["DEP1"],
				},
				{
					className: "MyClass2",
					exportedName: "MyClass2",
					name: "NAME2",
					dependencies: ["DEP2"],
				},
			]);
		});

		test("should extract multiple server entries when exported later", async () => {
			const extracted = await extract(`
        class MyClass1 extends ServerEntry<'NAME1', 'DEP1'> {
        }
        class MyClass2 extends ServerEntry<'NAME2', 'DEP2'> {
        }
        class MyClass3 extends ServerEntry<'NAME3', 'DEP3' | 'DEP4'> {
        }

        export { MyClass1 as MyClass1Alias, MyClass2 };
        export default MyClass3;
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: "MyClass1",
					exportedName: "MyClass1Alias",
					name: "NAME1",
					dependencies: ["DEP1"],
				},
				{
					className: "MyClass2",
					exportedName: "MyClass2",
					name: "NAME2",
					dependencies: ["DEP2"],
				},
				{
					className: "MyClass3",
					exportedName: "default",
					name: "NAME3",
					dependencies: ["DEP3", "DEP4"],
				},
			]);
		});

		test("should extract multiple server entries when exported later as default", async () => {
			const extracted = await extract(`
        class MyClass1 extends ServerEntry<'NAME1', 'DEP1'> {
        }
        class MyClass2 extends ServerEntry<'NAME2', 'DEP2'> {
        }
        class MyClass3 extends ServerEntry<'NAME3', 'DEP3' | 'DEP4'> {
        }

        export { MyClass1 as MyClass1Alias, MyClass2, MyClass3 as default };
      `);

			assert.deepStrictEqual(extracted, [
				{
					className: "MyClass1",
					exportedName: "MyClass1Alias",
					name: "NAME1",
					dependencies: ["DEP1"],
				},
				{
					className: "MyClass2",
					exportedName: "MyClass2",
					name: "NAME2",
					dependencies: ["DEP2"],
				},
				{
					className: "MyClass3",
					exportedName: "default",
					name: "NAME3",
					dependencies: ["DEP3", "DEP4"],
				},
			]);
		});
	});

	describe("failure", () => {
		test(
			"should extract a single server entry <number, string>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<1, 'DEP'> {
            }
          `),
				"at extends ServerEntry<1, 'DEP'>",
			),
		);

		test(
			"should extract a single server entry <boolean, string>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<true, 'DEP'> {
            }
          `),
				"at extends ServerEntry<true, 'DEP'>",
			),
		);

		test(
			"should extract a single server entry <null, string>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<null, 'DEP'> {
            }
          `),
				"at extends ServerEntry<null, 'DEP'>",
			),
		);

		test(
			"should extract a single server entry <undefined, string>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<undefined, 'DEP'> {
            }
          `),
				"at extends ServerEntry<undefined, 'DEP'>",
			),
		);

		test(
			"should extract a single server entry <object, string>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<{ foo: 'bar' }, 'DEP'> {
            }
          `),
				"at extends ServerEntry<{ foo: 'bar' }, 'DEP'>",
			),
		);

		test(
			"should extract a single server entry <array, string>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<['foo'], 'DEP'> {
            }
          `),
				"at extends ServerEntry<['foo'], 'DEP'>",
			),
		);

		test(
			"should extract a single server entry <union of non-strings, string>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<'foo' | 1, 'DEP'> {
            }
          `),
				"at extends ServerEntry<'foo' | 1, 'DEP'>",
			),
		);

		test(
			"should extract a single server entry <string, number>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<'foo', 1> {
            }
          `),
				"at extends ServerEntry<'foo', 1>",
			),
		);

		test(
			"should extract a single server entry <string, boolean>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<'foo', true> {
            }
          `),
				"at extends ServerEntry<'foo', true>",
			),
		);

		test(
			"should extract a single server entry <string, null>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<'foo', null> {
            }
          `),
				"at extends ServerEntry<'foo', null>",
			),
		);

		test(
			"should extract a single server entry <string, undefined>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<'foo', undefined> {
            }
          `),
				"at extends ServerEntry<'foo', undefined>",
			),
		);

		test(
			"should extract a single server entry <string, object>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<'foo', { foo: 'bar' }> {
            }
          `),
				"at extends ServerEntry<'foo', { foo: 'bar' }>",
			),
		);

		test(
			"should extract a single server entry <string, array>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<'foo', ['bar']> {
            }
          `),
				"at extends ServerEntry<'foo', ['bar']>",
			),
		);

		test(
			"should extract a single server entry <string, union of non-strings>",
			shouldThrowAsync(
				() =>
					extract(`
            export default class extends ServerEntry<'foo', 'bar' | 1> {
            }
          `),
				"at extends ServerEntry<'foo', 'bar' | 1>",
			),
		);
	});
});
