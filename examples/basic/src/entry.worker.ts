// I'm the entrypoint for your website. You can think of me as an eyeball worker
// that sits right next to the user's browser. I'm responsible for handling all
// incoming requests and routing them to the appropriate handler.
//
// Handlers can be either a React component, or an object that contains a `fetch`
// method. Any React component rendered directly by this handler is in the React
// "client" environment, often referred to as the "ssr" or "prerender" environment.
// This is ultimately where we turn everything into HTML, and is also the location
// to quickly send down a shell containing any necessary CSS or JS for the page.
//
// Any handler that is marked with `"use worker"` or `"use durable:<id>"` is
// executed via a Cloudflare service binding. These handlers are in the React
// "server" environment.

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
