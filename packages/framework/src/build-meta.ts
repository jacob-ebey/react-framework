import type { EnvironmentKeys } from "framework";

export type BindingsMeta = Record<EnvironmentKeys, EnvironmentKeys[]>;

export type BuildMeta = {
	bindings: BindingsMeta;
};
