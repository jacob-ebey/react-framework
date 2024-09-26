import type { PartialEnvironment } from "framework";
import { assert, ServerEntry } from "framework";
import { Durable } from "framework/cloudflare";

import type { DatabaseDurable, Profile } from "~/db.js";

export default class extends ServerEntry<"PROFILE"> {
	async fetch(request: Request) {
		const userId = this.cookie.get("userId");

		if (!userId) {
			return Response.json(
				{
					error: "Unauthorized",
				},
				{ status: 401 },
			);
		}

		const durable = this.env.PROFILE.get(this.env.PROFILE.idFromName(userId));
		const profile = await durable.getProfile();

		return Response.json(profile);
	}
}

type ProfileEnvironment = "DB";
// I'm a durable object that caches and persists a user's profile for fast retrieval.
export class ProfileDurable extends Durable<"PROFILE", ProfileEnvironment> {
	private db: DurableObjectStub<DatabaseDurable>;
	private profile: Profile | undefined = undefined;

	// Get the database stub and load the profile for caching in this durable object.
	constructor(
		ctx: DurableObjectState,
		env: PartialEnvironment<ProfileEnvironment>,
	) {
		super(ctx, env);

		this.db = env.DB.get(env.DB.idFromName(""));

		ctx.blockConcurrencyWhile(async () => {
			assert(ctx.id.name);
			this.profile = await this.db.getProfile(ctx.id.name);
		});
	}

	// Return the local copy of the profile immediately.
	getProfile() {
		return this.profile;
	}

	// Persist the profile and save a local copy for future retrieval.
	async updateProfile(profile: Profile) {
		assert(this.ctx.id.name);
		this.profile = await this.db.persistProfile(this.ctx.id.name, profile);
	}
}
