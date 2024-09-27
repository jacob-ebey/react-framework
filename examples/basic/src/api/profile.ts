import { assert, getContext, ServerEntry } from "framework";
import { Durable } from "framework";
import type { toDurableObjectStub } from "framework/cloudflare";

import type { DatabaseDurable, Profile } from "~/db.js";

export function eyeball() {
	const c = getContext();

	const userId = c.cookie.get("userId");
	if (userId) {
		return Response.json(
			{
				error: "Unauthorized",
			},
			{ status: 401 },
		);
	}
}

export default class extends ServerEntry<never, "PROFILE" | "DB"> {
	async fetch(request: Request) {
		const userId = this.cookie.get("userId", true);

		const durable = this.env.PROFILE.get(this.env.PROFILE.idFromName(userId));
		const profile = await durable.getProfile();

		return Response.json(profile);
	}
}

// I'm a durable object that caches and persists a user's profile for fast retrieval.
export class ProfileDurable extends Durable<"PROFILE", "DB"> {
	private db: toDurableObjectStub<DatabaseDurable>;
	private profile: Profile | undefined = undefined;

	// Get the database stub and load the profile for caching in this durable object.
	constructor() {
		super();

		this.db = this.env.DB.get(this.env.DB.idFromName(""));

		this.blockConcurrencyWhile(async () => {
			assert(this.id.name);
			this.profile = await this.db.getProfile(this.id.name);
		});
	}

	// Return the local copy of the profile immediately.
	getProfile() {
		return this.profile;
	}

	// Persist the profile and save a local copy for future retrieval.
	async updateProfile(profile: Profile) {
		assert(this.id.name);
		this.profile = await this.db.persistProfile(this.id.name, profile);
	}
}
