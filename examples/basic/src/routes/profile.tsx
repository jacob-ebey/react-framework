// I'm a profile route. I'm responsible for displaying and updating a user's profile.
// I use a durable object to cache the user's profile and persist for fast retrieval
// instead of interacting directly with the database from a worker.

import { actionRedirect, assert, getAction, getContext } from "framework";

import { validateProfileInput } from "~/lib.js";

// I execute on the eyeball worker before delegating the request to the
// service binding for this route.
export function eyeball() {
	const c = getContext();

	const userId = c.cookie.get("userId");
	if (!userId) {
		return Response.redirect("/");
	}
}

export type Environment = "PROFILE";

export default async function ProfileRoute() {
	// Get the state of the updateProfile action.
	const updateProfile = getAction(updateProfileAction);
	const c = getContext<Environment>();

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

	const c = getContext<Environment>();
	c.cookie.unset("userId");
	actionRedirect("/");
}

// A form action to update the user's profile.
async function updateProfileAction(formData: FormData) {
	"use server";

	const c = getContext<Environment>();

	const userId = c.cookie.get("userId", true);
	const durable = c.env.PROFILE.get(c.env.PROFILE.idFromName(userId));

	const input = validateProfileInput(formData);
	if (!input.valid) return "Invalid profile";

	await durable.updateProfile(input.data);
}
