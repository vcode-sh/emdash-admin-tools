import { ApiError } from "../../admin/api.js";
import type { TrashEntry, trashApi } from "./api.js";

type TrashApi = Pick<typeof trashApi, "list" | "remove">;
export interface TrashProgress {
	deleted: number;
	skipped: number;
	total: number;
}
export interface TrashResult extends TrashProgress {
	stopped: boolean;
	error?: string;
}

/** Finish discovery before confirmation, so deletion never adds new candidates. */
export async function collectTrash(
	api: TrashApi,
	collection: string,
): Promise<TrashEntry[]> {
	const entries = new Map<string, TrashEntry>();
	const cursors = new Set<string>();
	let cursor: string | undefined;
	do {
		const page = await api.list(collection, cursor);
		for (const item of page.items) entries.set(item.id, item);
		cursor = page.nextCursor;
		if (cursor && cursors.has(cursor))
			throw new Error(
				"Trash pagination did not advance. Refresh and try again.",
			);
		if (cursor) cursors.add(cursor);
	} while (cursor);
	return [...entries.values()];
}

/** Requests are serial: stop and errors prevent all subsequent deletions. */
export async function emptyTrash(
	api: TrashApi,
	collection: string,
	entries: readonly TrashEntry[],
	onProgress: (progress: TrashProgress) => void = () => {},
	shouldStop: () => boolean = () => false,
): Promise<TrashResult> {
	const ids = [...new Set(entries.map((entry) => entry.id))];
	const progress: TrashProgress = { deleted: 0, skipped: 0, total: ids.length };
	for (const id of ids) {
		if (shouldStop()) return { ...progress, stopped: true };
		try {
			const deleted = await api.remove(collection, id, shouldStop);
			if (!deleted) return { ...progress, stopped: true };
			progress.deleted++;
			if (deleted.id !== id) {
				return {
					...progress,
					stopped: true,
					error:
						"EmDash deleted an entry whose ID did not match the preview. The operation stopped. Review this collection before continuing.",
				};
			}
		} catch (error) {
			if (error instanceof ApiError && error.code === "NOT_FOUND") {
				progress.skipped++;
			} else {
				return {
					...progress,
					stopped: true,
					error:
						"The operation stopped because a deletion could not be confirmed. Refresh the trash before trying again.",
				};
			}
		}
		onProgress({ ...progress });
	}
	return { ...progress, stopped: false };
}
