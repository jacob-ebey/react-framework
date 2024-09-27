import type {
	EyeballBuildOutput,
	EnvironmentKeys,
	ServerConstructor,
	UNSAFE_CookieHandler,
} from "framework";
import {
	assert,
	UNSAFE_createCookieHandler,
	UNSAFE_FrameworkContextStorage,
} from "framework";

declare const EyeballEntry: ServerConstructor;
const COOKIE_SECRET_KEYS = ["COOKIE_SECRET"] as EnvironmentKeys[];

export default {
	async fetch(request, c) {
		let cookieHandler: UNSAFE_CookieHandler | undefined;
		if (!c.cookie) {
			assert(c.env, "No environment available.");

			const secrets: string[] = [];
			for (const key of COOKIE_SECRET_KEYS) {
				if (c.env[key] && typeof c.env[key] === "string") {
					secrets.push(c.env[key]);
				}
			}

			cookieHandler = UNSAFE_createCookieHandler(
				request.headers.get("Cookie"),
				secrets,
			);
			c.cookie = cookieHandler.cookie;
		}

		const response = await UNSAFE_FrameworkContextStorage.run(c, () => {
			return new EyeballEntry().fetch(request);
		});

		return cookieHandler ? cookieHandler.send(response) : response;
	},
} satisfies EyeballBuildOutput;
