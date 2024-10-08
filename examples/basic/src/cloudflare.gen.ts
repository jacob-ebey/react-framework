// TODO: This file should be generated by the framework based on the entry
// eyeball worker's module graph and the wrangler.toml(?)

import type { toDurableObjectNamespace } from "framework/cloudflare";

import type { DatabaseDurable } from "./db.js";
import type { ProfileDurable } from "./api/profile.js";

export interface Env {
	D1: D1Database;
	DB: toDurableObjectNamespace<DatabaseDurable>;
	PROFILE: toDurableObjectNamespace<ProfileDurable>;
}
