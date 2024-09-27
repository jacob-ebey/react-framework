// I'm the entrypoint for your website. You can think of me as an eyeball worker
// that sits right next to the user's browser. I'm responsible for handling all
// incoming requests and routing them to the appropriate handler.
//
// Handlers can be either a React component, or an object that contains a `fetch`
// method. Any React component rendered directly by this handler is in the React
// "client" environment, often referred to as the "ssr" or "prerender" environment.
// This is ultimately where we turn everything into HTML, and is also the location
// to quickly send down a shell containing any necessary CSS or JS for the page.
//
// Import assertions are used to transform modules and make composing spatial compute
// easy. Below, the "react-worker" type is used to transform the module into a
// `{ fetch() }` object that invokes the appropriate service binding.
//
// Each "worker" and "react-worker" type creates a new worker entrypoint.

import type { EnvironmentKeys } from "framework";
import { handleRequest, ServerEntry } from "framework";

import type { Env } from "./cloudflare.gen.js";

declare module "framework" {
	export interface Cookies {
		userId: string;
	}

	// In this example we pass through the cloudflare environment directly.
	export interface Environment extends Env {}
}

export default class extends ServerEntry<never, EnvironmentKeys> {
	async fetch(request: Request) {
		const t = await import("./api/profile.js", {
			with: { type: "worker" },
		});

		return handleRequest(request, this, [
			{
				id: "shell",
				import: () => import("./global-shell.js"),
				children: [
					{
						id: "layout",
						cache: true,
						import: () =>
							import("./routes/layout.js", {
								with: { type: "react-service" },
							}),
						children: [
							{
								id: "login",
								index: true,
								cache: true,
								import: () =>
									import("./routes/login.js", {
										with: { type: "react-service" },
									}),
							},
							{
								id: "profile",
								pattern: { pathname: "/profile" },
								import: () =>
									import("./routes/profile.js", {
										with: { type: "react-service" },
									}),
							},
						],
					},
				],
			},
			{
				id: "api/profile",
				pattern: { pathname: "/api/profile" },
				import: () =>
					import("./api/profile.js", {
						with: { type: "service" },
					}),
			},
			{
				id: "api/status",
				pattern: { pathname: "/api/status" },
				import: () => import("./api/status.js"),
			},
			{
				id: "api/ping",
				pattern: { pathname: "/api/ping" },
				import: () => import("./api/ping.js"),
			},
		]);
	}
}
