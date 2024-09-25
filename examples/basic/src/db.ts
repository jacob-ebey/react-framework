import { DurableObject } from "cloudflare:workers";

export type LoginInput = { email: string; password: string };

export type Profile = { displayName: string };

export type ProfileInput = { displayName: string };

export type User = { id: string };

export class DB extends DurableObject {
  async getProfile(userId: string): Promise<Profile> {
    return { displayName: "John Doe" };
  }

  async loginUser(input: LoginInput): Promise<User> {
    return { id: "123" };
  }

  async persistProfile(
    userId: string,
    profile: ProfileInput
  ): Promise<Profile> {
    return { displayName: profile.displayName };
  }
}
