import { Environment, handleRequest } from "cf-framework";

import type { DB } from "./db.js";

declare module "cf-framework" {
  interface Environment {
    DB: DurableObjectNamespace<DB>;
  }
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx, [
      {
        import: () => import("./global-shell.js"),
        children: [
          {
            index: true,
            import: () => import("./routes/login.js"),
          },
          {
            path: "/profile",
            import: () => import("./routes/profile.js"),
          },
        ],
      },
    ]);
  },
} satisfies ExportedHandler<Environment>;
