import { DurableObject } from "cloudflare:workers";
import type { EnvironmentKeys, PartialEnvironment } from "framework";

export abstract class Durable<
	Name extends string,
	Keys extends EnvironmentKeys = EnvironmentKeys,
> extends DurableObject<PartialEnvironment<Keys>> {}
