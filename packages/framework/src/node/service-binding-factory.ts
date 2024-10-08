import type {
	EnvironmentKeys,
	Fetcher,
	ServiceBindingFactoryMeta,
} from "framework";
import { ServerEntry } from "framework";

class Binding extends ServerEntry<never, EnvironmentKeys> {
	constructor(private name: string) {
		super();
	}

	async fetch(request: Request) {
		return new Response(`Hello, ${this.name} binding!`);
	}
}

export default function cloudflareServiceBindingFactory({
	name,
}: ServiceBindingFactoryMeta): Fetcher {
	return new Binding(name);
}
