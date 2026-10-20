import { spyOn } from "bun:test";

/** Preserve Bun's fetch extension while replacing only the HTTP transport. */
export function substituteFetch(
	handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
) {
	return spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(handler, { preconnect: globalThis.fetch.preconnect }),
	);
}
