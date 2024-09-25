# Cloudflare based react framework

Entrypoint is a standard worker entrypoint exporting default an `ExportedHandler`. It configures the eyeball worker with a `handleRequest` function that accepts a routes configuration. This is the "prerender" server that renders to HTML.

The `import` of each route config can either point to a module that contains a default export that is a React component, or a module that exports a `fetch()` handler that dispatches to another RSC server.

## `use worker`

Denotes a module as a unique worker entrypoint and a react-server context that runs as close as possible to the user.

This results in the module becoming an entrypoint in the "server" environment and resulting in a module that, in-concept, looks like:

```ts
import { handleActions, renderToReadableStream } from "cf-framework/server";
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

## `use durable:<id>`

Denotes a module as a unique worker entrypoint and a react-server context that runs as close to the user as possible with a correlated durable object.

This results in the module becoming an entrypoint in the "server" environment and resulting in a module that, in-concept, looks like:

```ts
import {
  handleActions,
  provideDurable,
  renderToReadableStream,
} from "cf-framework/server";
import * as mod from "./path-to-use-worker-module";

export default {
  fetch(request, env, ctx) {
    // Create an instance of the durable object provided by the module
    return provideDurable(
      "<durable_name>",
      mod,
      request,
      env,
      ctx,
      async (durableInstance) => {
        // Execute server actions.
        const actionResults = await handleActions(
          mod,
          request,
          env,
          ctx,
          durableInstance
        );
        // Render the app.
        return renderToReadableStream(mod, request, env, ctx, actionResults);
      }
    );
  },
} satisfies ExportedHandler;
```

### `class Durable`

A class that extends and implements the `DurableObject` from `cloudflare:workers`. This is the implementation of the durable object instance that is available through `getDurable()`.

### `function durable()`

A function that determines how to construct an instance of the Durable class. Has access to `getContext()`.

**Returns**

```ts
type DurableConfig = {
  id: string;
  locationHint?: string;
};
```
