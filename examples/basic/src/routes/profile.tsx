// I'm a profile route. I'm responsible for displaying and updating a user's profile.
// I use a durable object to cache the user's profile and persist for fast retrieval
// instead of interacting directly with the database from a worker.

import type { Environment } from "framework";
import { assert, getAction, getContext } from "framework";
import { Durable } from "framework/cloudflare";

import type { DatabaseDurable, Profile } from "~/db.js";
import { validateProfileInput } from "~/lib.js";

// I execute on the eyeball worker before delegating the request to the
// service binding for this route.
export function eyeball() {
	const c = getContext();

	const userId = c.cookie.get("userId");
	if (!userId) {
		throw c.redirect("/");
	}
}

export default async function ProfileRoute() {
	// Get the state of the updateProfile action.
	const updateProfile = getAction(updateProfileAction);
	const c = getContext();

	const userId = c.cookie.get("userId", true);
	const durable = c.env.PROFILE.get(c.env.PROFILE.idFromName(userId));

	// Get the user's profile using the durable object.
	const profile = await durable.getProfile();
	assert(profile);

	return (
		<div>
			<form action={logoutAction}>
				<button type="submit">Logout</button>
			</form>
			<form action={updateProfile.action}>
				<label>
					Display Name
					<br />
					<input
						required
						type="text"
						name="displayName"
						defaultValue={profile.displayName}
					/>
				</label>
				<br />
				<button type="submit">Save</button>
				{!!updateProfile.data && <p>{updateProfile.data}</p>}
			</form>
		</div>
	);
}

// A form action to log out a user.
async function logoutAction() {
	"use server";

	const c = getContext();
	c.cookie.unset("userId");
	throw c.redirect("/");
}

// A form action to update the user's profile.
async function updateProfileAction(formData: FormData) {
	"use server";

	const c = getContext();

	const userId = c.cookie.get("userId", true);
	const durable = c.env.PROFILE.get(c.env.PROFILE.idFromName(userId));

	const input = validateProfileInput(formData);
	if (!input.valid) return "Invalid profile";

	await durable.updateProfile(input.data);
}

// I'm a durable object that caches and persists a user's profile for fast retrieval.
export class ProfileDurable extends Durable<"PROFILE"> {
	private db: DurableObjectStub<DatabaseDurable>;
	private profile: Profile | undefined = undefined;

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env);

		this.db = env.DB.get(env.DB.idFromName(""));

		ctx.blockConcurrencyWhile(async () => {
			assert(ctx.id.name);
			this.profile = await this.db.getProfile(ctx.id.name);
		});
	}

	getProfile() {
		// Return the local copy of the profile immediately.
		return this.profile;
	}

	async updateProfile(profile: Profile) {
		assert(this.ctx.id.name);
		// Persist the profile and save a local copy for future retrieval.
		this.profile = await this.db.persistProfile(this.ctx.id.name, profile);
	}
}
