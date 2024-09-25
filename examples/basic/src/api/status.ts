import type { Environment, ExecutionContext } from "framework";
import { ServerEntry } from "framework";

import type { DatabaseDurable } from "~/db.js";

export default class extends ServerEntry {
	private db: DurableObjectStub<DatabaseDurable>;

	constructor(ctx: ExecutionContext, env: Environment) {
		super(ctx, env);

		this.db = env.DB.get(env.DB.idFromName(""));
	}

	async fetch() {
		const allStatus = (await Promise.all([
			this.db
				.status()
				.then((status) => ["db", status] as const)
				.catch(() => ["db", "failed to get status"] as const),
		])) satisfies [readonly ["db", string]];

		let status = 200;
		const result = {} as Record<(typeof allStatus)[number][0], string>;
		for (const [key, value] of allStatus) {
			if (value !== "ok") {
				status = 500;
			}
			result[key] = value;
		}

		return Response.json(result, { status });
	}
}
