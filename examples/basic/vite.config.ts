import framework from "framework/vite";
import node, { fsStorage } from "framework/vite/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
		tsconfigPaths(),
		framework({
			cookieSecretKeys: ["ENCRYPTION_SECRET"],
			entry: "src/entry.worker.ts",
			serviceBindingFactory: "framework/node/service-binding-factory",
		}),
		node(),
	],
});
