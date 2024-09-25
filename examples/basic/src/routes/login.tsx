// I'm a login route. I'm responsible for authenticating a user and setting a cookie
// to remember them.

"use worker";

import { getAction, getContext } from "cf-framework";
import { validateLoginInput } from "~/lib.js";

// A form action to log in a user.
async function loginAction(formData: FormData) {
	"use server";

	// Get the current request context.
	const c = getContext();
	const input = await validateLoginInput(formData);
	if (!input.valid) return "Invalid email or password.";

	// Validate the user's credentials.
	const db = c.env.DB.get(c.env.DB.idFromName(""));
	const user = await db.loginUser(input.data);
	if (!user) return "Invalid email or password.";

	// Set the user's ID in a signed cookie.
	c.cookie.setSigned("userId", user.id);
	throw c.redirect("/profile");
}

export default function LoginRoute() {
	// Get the current request context.
	const c = getContext();
	// Get the state of the login action.
	const login = getAction(loginAction);

	if (c.cookie.get("userId")) {
		c.redirect("/profile");
	}

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
