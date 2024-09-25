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

## Example App

### entry.worker.ts

The entrypoint for the application. Can be thought of as an "eyeball" worker.

```ts
import { handleRequest } from "cf-framework";

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx, [
      {
        import: () => import("./global-shell"),
        children: [
          {
            index: true,
            import: () => import("./login"),
          },
          {
            path: "/profile",
            import: () => import("./profile"),
          },
        ],
      },
    ]);
  },
};
```

### global-shell.tsx

The global shell. Since I don't specify any directives, I render on the edge as close to the user as possible in the "client" / ssr / prerender runtime.

```tsx
export default function GlobalShell({ children }) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  );
}
```

### login.tsx

The login route. Since I specify `"use worker"`, I am a react-server context and get executed as close to the user as possible. I become a standalone worker that is called via a service binding by `handleRequest` in `entry.worker.ts`.

```tsx
"use worker";

import { getAction, getContext } from "cf-framework";
import { validateLoginInput } from "~/lib";

async function login(formData: FormData) {
  "use server";

  const c = getContext();
  const input = await validateLoginInput(formData);
  if (!input.valid) return "Invalid email or password.";

  const user = await c.env.DB.loginUser(input.data);
  if (!user) return "Invalid email or password.";

  c.cookie.setSigned("userId", user.id);
  c.redirect("/profile");
}

export default function Login() {
  const c = getContext();
  const loginError = getAction(login);

  if (c.cookie.get("userId")) {
    throw c.redirect("/profile");
  }

  return (
    <form action={login}>
      <label>
        Email
        <br />
        <input required type="email" name="email" />
      </label>
      <label>
        Password
        <br />
        <input required type="password" name="password" />
      </label>
      <br />
      <button type="submit">Login</button>
      {!!loginError && <p>{loginError}</p>}
    </form>
  );
}
```

**profile.tsx**

The profile route. Since I specify `use durable:<id>`, I am a react-server context and get executed as close to the user as possible with my Durable class being thought of as a long lived context per user.

```tsx
"use durable:profile";

import { getAction, getContext, getDurable } from "cf-framework";
import { DurableObject } from "cloudflare:workers";
import { validateProfileInput } from "~/lib";

type Profile = { displayName: string; };

export class Durable extends DurableObject {
  private profile: Profile | undefined = undefined;

  constructor(ctx, env) {
    super(ctx, env);
    if (!ctx.id.name) {
      throw new Error("Profile durable objects must be initialized with a named ID.");
    }
    ctx.blockConcurrencyWhile(async () => {
      // Load the profile and store it locally for fast retrieval.
      this.profile = await env.DB.getProfile();
    });
  }

  getProfile() {
    // Return the local copy of the profile immediately.
    return this.profile;
  }

  async updateProfile(profile: Profile) {
    // Persist the profile and save a local copy for future retrieval.
    this.profile = await this.env.DB.persistProfile(this.id.name, profile);
  },
}

export function durable() {
  const c = getContext();

  // The ID of this durable object is the unique userID
  const userId = c.cookie.getSigned("userId");
  if (!userId) {
    // If we don't have a userID, redirect to the login route
    c.redirect("/");
  }

  return {
    id: userId,
    // place it as close to the user as possible
    locationHint: c.cf.colo,
  };
}

async function updateProfile(formData: FormData) {
  "use server";

  // No need to validate authentication as the durable() function above can only
  // succeed and create an instance if the user is authenticated.
  const durable = getDurable<Durable>();

  const input = await validateProfileInput(formData);
  if (!input.valid) return "Invalid profile";

  await durable.updateProfile(input.data);
}

export default async function Profile() {
  const saveError = getAction(updateProfile);
  const durable = getDurable<Durable>();
  const profile = await durable.getProfile();

  return (
    <form>
      <label>
        Display Name
        <br />
        <input required type="text" name="displayName" />
      </label>
      <br />
      <button type="submit">Save</button>
      {!!saveError && <p>{saveError}</p>}
    </form>
  );
}
```
