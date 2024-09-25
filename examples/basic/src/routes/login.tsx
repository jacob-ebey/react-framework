"use worker";

import { getAction, getContext } from "cf-framework";
import { validateLoginInput } from "~/lib.js";

async function loginAction(formData: FormData) {
  "use server";

  const c = getContext();
  const input = await validateLoginInput(formData);
  if (!input.valid) return "Invalid email or password.";

  const db = c.env.DB.get(c.env.DB.idFromName(""));
  const user = await db.loginUser(input.data);
  if (!user) return "Invalid email or password.";

  c.cookie.setSigned("userId", user.id);
  c.redirect("/profile");
}

export default function Login() {
  const c = getContext();
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
