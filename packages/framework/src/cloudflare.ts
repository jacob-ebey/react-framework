import { DurableObject } from "cloudflare:workers";
import type { Environment, PartialEnvironment } from "framework";

export abstract class Durable<
	Name extends string,
	Keys extends keyof Environment,
> extends DurableObject<PartialEnvironment<Keys>> {}
