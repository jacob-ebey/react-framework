import type { EnvironmentKeys } from "framework";
import {
	assert,
	Durable as BaseDurable,
	UNSAFE_FrameworkContextStorage,
} from "framework";

export type toDurableObjectNamespace<T> = DurableObjectNamespace<
	toDurableObject<T>
>;

export type toDurableObject<T> = Rpc.DurableObjectBranded & T;

export type toDurableObjectStub<T> = DurableObjectStub<toDurableObject<T>>;

export abstract class Durable<
	Name extends string,
	Dependencies extends EnvironmentKeys,
> extends BaseDurable<Name, Dependencies> {
	id: DurableObjectId;
	storage: DurableObjectStorage;

	constructor() {
		super();

		const c = UNSAFE_FrameworkContextStorage.getStore();
		assert(c, "No context available.");

		this.id = c.durableId as DurableObjectId;
		this.storage = c.storage as DurableObjectStorage;
	}
}
