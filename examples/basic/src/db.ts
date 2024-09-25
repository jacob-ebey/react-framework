// I'm a Database API for the application. I run in a durable object and am
// responsible for managing the application's data. I can be used to store
// and retrieve data, as well as perform any other operations that require
// state to be maintained across requests and accessible from multiple
// workers / durable objects.

import { Durable } from "framework/cloudflare";

export type LoginInput = { email: string; password: string };

export type Profile = { displayName: string };

export type ProfileInput = { displayName: string };

export type User = { id: string };

export class DatabaseDurable extends Durable<"DB"> {
	status() {
		return "ok";
	}

	getProfile(userId: string) {
		return { displayName: "John Doe" } as Profile;
	}

	loginUser(input: LoginInput) {
		return { id: "123" } as User;
	}

	persistProfile(userId: string, profile: ProfileInput) {
		return { displayName: profile.displayName } as Profile;
	}
}
