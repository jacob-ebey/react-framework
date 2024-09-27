import type * as vite from "vite";

import { assert } from "framework/utils";
import type { StorageConfig } from "framework/vite";

export type FsStorageConfig = {
	rootdir: string;
};

export function fsStorage({ rootdir }: FsStorageConfig): StorageConfig {
	assert(rootdir, "rootdir is required");

	return {
		package: "fs-storage",
		config: {
			rootdir,
		},
	};
}

export type NodeConfig = any;

export default async function node(
	config: NodeConfig = {},
): Promise<vite.Plugin> {
	return {
		name: "framework:node",
	};
}
