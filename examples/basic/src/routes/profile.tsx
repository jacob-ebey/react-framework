"use durable:profile";

import type { DurableConfig, Environment } from "cf-framework";
import { getAction, getContext, getDurable } from "cf-framework";
import { assert } from "cf-framework/utils";
import { DurableObject } from "cloudflare:workers";

import type { DB, Profile } from "~/db.js";
import { validateProfileInput } from "~/lib.js";

export class Durable extends DurableObject<Environment> {
  private db: DurableObjectStub<DB>;
  private profile: Profile | undefined = undefined;

  constructor(ctx: DurableObjectState, env: Environment) {
    super(ctx, env);

    this.db = env.DB.get(env.DB.idFromName(""));

    ctx.blockConcurrencyWhile(async () => {
      assert(ctx.id.name);
      this.profile = await this.db.getProfile(ctx.id.name);
    });
  }

  getProfile() {
    // Return the local copy of the profile immediately.
    return this.profile;
  }

  async updateProfile(profile: Profile) {
    assert(this.ctx.id.name);
    // Persist the profile and save a local copy for future retrieval.
    this.profile = await this.db.persistProfile(this.ctx.id.name, profile);
  }
}

export function durable(): DurableConfig {
  const c = getContext();

  // The ID of this durable object is the unique userID
  const userId = c.cookie.getSigned("userId");
  if (!userId) {
    // If we don't have a userID, redirect to the login route
    throw c.redirect("/");
  }

  return {
    id: userId,
    // place it as close to the user as possible
    // locationHint: c.cf.colo,
  };
}

async function updateProfileAction(formData: FormData) {
  "use server";

  // No need to validate authentication as the durable() function above can only
  // succeed and create an instance if the user is authenticated.
  const durable = getDurable<Durable>();

  const input = validateProfileInput(formData);
  if (!input.valid) return "Invalid profile";

  await durable.updateProfile(input.data);
}

export default async function Profile() {
  const updateProfile = getAction(updateProfileAction);
  const durable = getDurable<Durable>();
  const profile = await durable.getProfile();
  assert(profile);

  return (
    <form>
      <label>
        Display Name
        <br />
        <input
          required
          type="text"
          name="displayName"
          defaultValue={profile.displayName}
        />
      </label>
      <br />
      <button type="submit">Save</button>
      {!!updateProfile.data && <p>{updateProfile.data}</p>}
    </form>
  );
}
