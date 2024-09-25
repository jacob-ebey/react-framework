import { DurableObject } from "cloudflare:workers";
import type { Environment } from "framework";

export class Durable<
	Name extends string,
	Env = Environment,
> extends DurableObject<Env> {}
