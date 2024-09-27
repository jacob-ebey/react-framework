import type {
	EnvironmentKeys,
	ServiceBinding,
	ServiceBindingFactory,
	ServiceBindingFactoryArgs,
} from "framework";
import { assert, ServerEntry } from "framework";

declare const serviceBindingFactory: ServiceBindingFactory;

export default class extends ServerEntry<never, EnvironmentKeys> {
	private binding: ServiceBinding;

	constructor() {
		super();

		const args: ServiceBindingFactoryArgs =
			"__SERVICE_BINDING_FACTORY_ARGS__" as unknown as ServiceBindingFactoryArgs;

		assert(
			(args as unknown) !== "__SERVICE_BINDING_FACTORY_ARGS__",
			"service binding factory args not provided",
		);
		assert(args, "service binding factory args not provided");
		assert(
			typeof serviceBindingFactory === "function",
			"serviceBindingFactory a function",
		);

		this.binding = serviceBindingFactory(args);
	}

	fetch(request: Request) {
		return this.binding.fetch(request);
	}
}
