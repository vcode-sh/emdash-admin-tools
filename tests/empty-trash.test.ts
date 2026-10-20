import { expect, test } from "bun:test";
import { ApiError } from "../src/admin/api";
import type { TrashEntry } from "../src/modules/empty-trash/api";
import { collectTrash, emptyTrash } from "../src/modules/empty-trash/workflow";

const entry = (id: string): TrashEntry => ({
	id,
	slug: id,
	deletedAt: "2026-10-20T10:00:00Z",
});

test("preview follows opaque cursors and does not duplicate overlapping entries", async () => {
	const cursors: (string | undefined)[] = [];
	const api = {
		async list(_collection: string, cursor?: string) {
			cursors.push(cursor);
			return cursor === undefined
				? {
						items: [entry("first"), entry("second")],
						nextCursor: "opaque/next+1",
					}
				: { items: [entry("second"), entry("third")] };
		},
		async remove(_collection: string, id: string) {
			return { deleted: true as const, id };
		},
	};
	const result = await collectTrash(api, "posts");
	expect(result.map((item) => item.id)).toEqual(["first", "second", "third"]);
	expect(cursors).toEqual([undefined, "opaque/next+1"]);
});

test("a repeated cursor rejects the preview instead of looping or permitting a partial purge", async () => {
	const api = {
		async list() {
			return { items: [entry("one")], nextCursor: "stuck" };
		},
		async remove(_collection: string, id: string) {
			return { deleted: true as const, id };
		},
	};
	await expect(collectTrash(api, "posts")).rejects.toThrow(
		"Trash pagination did not advance",
	);
});

test("purge touches only preview IDs, skips restored entries and continues past them", async () => {
	const stored = new Set([
		"first",
		"restored",
		"last",
		"new-trash",
		"published",
	]);
	const api = {
		async list() {
			throw new Error("Deletion must not discover new candidates.");
		},
		async remove(_collection: string, id: string) {
			if (id === "restored") throw new ApiError("NOT_FOUND", "Not in trash");
			stored.delete(id);
			return { deleted: true as const, id };
		},
	};
	const result = await emptyTrash(api, "posts", [
		entry("first"),
		entry("restored"),
		entry("last"),
	]);
	expect(result).toEqual({ deleted: 2, skipped: 1, total: 3, stopped: false });
	expect([...stored]).toEqual(["restored", "new-trash", "published"]);
});

test("an uncertain deletion stops later writes and reports only acknowledged success", async () => {
	const stored = new Set(["first", "uncertain", "last"]);
	const api = {
		async list() {
			return { items: [] };
		},
		async remove(_collection: string, id: string) {
			stored.delete(id);
			if (id === "uncertain") throw new Error("Connection lost after commit");
			return { deleted: true as const, id };
		},
	};
	const result = await emptyTrash(api, "posts", [
		entry("first"),
		entry("uncertain"),
		entry("last"),
	]);
	expect(result.deleted).toBe(1);
	expect(result.stopped).toBe(true);
	expect(result.error).toBe(
		"The operation stopped because a deletion could not be confirmed. Refresh the trash before trying again.",
	);
	expect([...stored]).toEqual(["last"]);
});

test("stop lets an in-flight delete settle but prevents the next request", async () => {
	const started = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const stored = new Set(["first", "second"]);
	let stop = false;
	const api = {
		async list() {
			return { items: [] };
		},
		async remove(_collection: string, id: string) {
			started.resolve();
			await release.promise;
			stored.delete(id);
			return { deleted: true as const, id };
		},
	};
	const pending = emptyTrash(
		api,
		"posts",
		[entry("first"), entry("second")],
		undefined,
		() => stop,
	);
	await started.promise;
	stop = true;
	release.resolve();
	expect(await pending).toEqual({
		deleted: 1,
		skipped: 0,
		total: 2,
		stopped: true,
	});
	expect([...stored]).toEqual(["second"]);
});
