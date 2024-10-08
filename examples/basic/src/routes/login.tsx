// I'm a login route. I'm responsible for authenticating a user and setting a cookie
// to remember them.

import { actionRedirect, getAction, getContext } from "framework";

import { validateLoginInput } from "~/lib.js";

// I execute on the eyeball worker before delegating the request to the
// service binding for this route.
export function eyeball() {
	const c = getContext();

	const userId = c.cookie.get("userId");
	if (userId) {
		return Response.redirect("/profile");
	}
}

export type Environment = "DB";

export default function LoginRoute() {
	// Get the state of the login action.
	const login = getAction(loginAction);

	return (
		<form action={login.action}>
			<label>
				Email
				<br />
				<input required type="email" name="email" />
			</label>
			<label>
				Password
				<br />
				<input required type="password" name="password" />
			</label>
			<br />
			<button type="submit">Login</button>
			{!!login.data && <p>{login.data}</p>}
		</form>
	);
}

// A form action to log in a user.
async function loginAction(formData: FormData) {
	"use server";

	// Get the current request context.
	const c = getContext<Environment>();
	const input = await validateLoginInput(formData);
	if (!input.valid) return "Invalid email or password.";

	// Validate the user's credentials.
	const db = c.env.DB.get(c.env.DB.idFromName(""));
	const user = await db.loginUser(input.data);
	if (!user) return "Invalid email or password.";

	// Set the user's ID in a signed cookie.
	c.cookie.set("userId", user.id);
	actionRedirect("/profile");
}
