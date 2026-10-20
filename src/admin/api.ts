import { apiFetch } from "emdash/plugin-utils";

export class ApiError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message);
	}
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await apiFetch(path, init);
	const result = await response.json();
	if (!response.ok || result.success !== true) {
		throw new ApiError(
			result.error?.code ?? "REQUEST_FAILED",
			result.error?.message ?? "The request failed.",
		);
	}
	return result.data;
}

export const pluginApi = "/_emdash/api/plugins/emdash-admin-tools";
