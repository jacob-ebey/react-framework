import framework from "framework/vite";
import node from "framework/vite/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	builder: {
		async buildApp(builder) {
			await builder.build(builder.environments.DB);
		},
	},
	environments: {
		DB: {
			build: {
				outDir: "dist/db",
				rollupOptions: {
					input: "src/db.ts",
				},
			},
		},
	},
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
