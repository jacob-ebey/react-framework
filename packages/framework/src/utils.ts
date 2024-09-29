export function assert<T>(
	condition: T,
	message?: string | (() => string),
): asserts condition {
	if (!condition) {
		throw new Error(
			(typeof message === "function" ? message() : message) ??
				"Assertion failed",
		);
	}
}
