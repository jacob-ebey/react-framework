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

	fetch(request: Request) {
		const binding = this.env[this.name] as Fetcher;
		return binding.fetch(request);
	}
}

export default function cloudflareServiceBindingFactory({
	name,
}: ServiceBindingFactoryMeta): Fetcher {
	return new Binding(name);
}
