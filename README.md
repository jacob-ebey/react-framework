# React Framework

> [!NOTE]  
> This is a work in progress. Assume any CF specific terms below are placeholders and will be abstracted out for any runtime.
>
> - `ExportedHandler` = `ServerEntry`
> - `DurableObject` = `Durable`

Entrypoint is a standard worker entrypoint exporting default an `ExportedHandler`. It configures the eyeball worker with a `handleRequest` function that accepts a routes configuration. This is the "prerender" server that renders to HTML.

The `import` of each route config can either point to a module that contains a default export that is a React component, or a module that exports a `fetch()` handler that dispatches to another RSC server.

## `class Durable<Name, Env>`

A class that extends and brands the cloudflare DurableObject class. It is used for discovery, type generation and deployment configuration.

## `service` Module

```ts
import("./api/profile.js", { with: { type: "service" } });
```

Denotes a module as a unique worker entrypoint and a react-server context that runs as close as possible to the user and is executed through a service binding from the eyeball worker.

### `function eyeball()`

A function that executes on the eyeball worker before delegating the request to the service binding for this route.

## `react-service` Module

```ts
import("./routes/login.js", { with: { type: "react-service" } });
```

Denotes a module as a unique worker entrypoint and a react-server context that runs as close as possible to the user and is executed through a service binding from the eyeball worker.

This results in the module becoming an entrypoint in the "server" environment and resulting in a module that, in-concept, looks like:

```ts
import { handleActions, renderToReadableStream } from "framework/server";
import * as mod from "./path-to-use-worker-module";

export default {
  async fetch(request, env, ctx) {
    // Execute server actions.
    const actionResults = await handleActions(request, env, ctx, mod);
    // Render the app.
    return renderToReadableStream(request, env, ctx, actionResults, mod);
  },
} satisfies ExportedHandler;
```

Can also contain an eyeball function that runs on the eyeball worker before delegating the request to the service binding for this route.
