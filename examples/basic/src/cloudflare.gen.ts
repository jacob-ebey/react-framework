// TODO: This file should be generated by the framework based on the entry
// eyeball worker's module graph.

import type { DatabaseDurable } from "./db.js";
import type { ProfileDurable } from "./routes/profile.js";

export interface Env {
	DB: DurableObjectNamespace<DatabaseDurable>;
	PROFILE: DurableObjectNamespace<ProfileDurable>;
}
