import { ServerEntry } from "framework";

export default class extends ServerEntry<never, never> {
	async fetch() {
		return Response.json("pong");
	}
}
