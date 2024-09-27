import type { ServiceBinding, ServiceBindingFactoryArgs } from "framework";

export default function nodeServiceBindingFactory({
	name,
}: ServiceBindingFactoryArgs): ServiceBinding {
	return {
		async fetch(request) {
			return new Response(`Hello, ${name} binding!`);
		},
	};
}
