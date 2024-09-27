import type {
	EnvironmentKeys,
	ServiceBindingFactory,
	ServiceBindingFactoryMeta,
} from "framework";
import { assert, ServerEntry } from "framework";

declare const serviceBindingFactory: ServiceBindingFactory;

export default class extends ServerEntry<never, EnvironmentKeys> {
	private server: ServerEntry<never, EnvironmentKeys>;

	constructor() {
		super();

		const args: ServiceBindingFactoryMeta =
			"__SERVICE_BINDING_FACTORY_ARGS__" as unknown as ServiceBindingFactoryMeta;

		assert(
			typeof args === "object",
			"service binding factory args not provided",
		);
		assert(
			typeof serviceBindingFactory === "function",
			"serviceBindingFactory a function",
		);

		this.server = serviceBindingFactory(args);
	}

	fetch(request: Request) {
		return this.server.fetch(request);
	}
}
