import { ApiError, pluginApi, request } from "../../admin/api.js";
import type { ModuleState } from "../registry.js";

export interface TrashEntry {
	id: string;
	slug: string | null;
	deletedAt: string;
}
export interface TrashPage {
	items: TrashEntry[];
	nextCursor?: string;
}
export interface Collection {
	slug: string;
	label: string;
}

export const trashApi = {
	async collections() {
		return (
			await request<{ items: Collection[] }>("/_emdash/api/schema/collections")
		).items;
	},
	list(collection: string, cursor?: string): Promise<TrashPage> {
		const params = new URLSearchParams({ limit: "100" });
		if (cursor) params.set("cursor", cursor);
		return request(
			`/_emdash/api/content/${encodeURIComponent(collection)}/trash?${params}`,
		);
	},
	async remove(collection: string, id: string, shouldStop = () => false) {
		// A stale page must respect module changes and plugin deactivation.
		const state = await request<{ modules: ModuleState[] }>(
			`${pluginApi}/modules`,
		).catch((error: unknown) => {
			if (error instanceof ApiError && error.code === "NOT_FOUND") {
				throw new ApiError(
					"MODULE_UNAVAILABLE",
					"Admin Tools is no longer available.",
				);
			}
			throw error;
		});
		if (shouldStop()) return null;
		if (
			!state.modules.some(
				(module) => module.id === "empty-trash" && module.enabled,
			)
		) {
			throw new ApiError("MODULE_DISABLED", "Empty Trash is disabled.");
		}
		return request<{ deleted: true; id: string }>(
			`/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/permanent`,
			{ method: "DELETE" },
		);
	},
};
