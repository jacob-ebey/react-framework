// I'm a Database API for the application. I run in a durable object and am
// responsible for managing the application's data. I can be used to store
// and retrieve data, as well as perform any other operations that require
// state to be maintained across requests and accessible from multiple
// workers / durable objects.

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
		profile: ProfileInput,
	): Promise<Profile> {
		return { displayName: profile.displayName };
	}
}
