import { expect, test } from "bun:test";
import { trashApi } from "../src/modules/empty-trash/api";
import { emptyTrash } from "../src/modules/empty-trash/workflow";
import { substituteFetch } from "./fetch";

const entries = [
	{ id: "first", slug: "first", deletedAt: "2026-10-20T10:00:00Z" },
	{ id: "second", slug: "second", deletedAt: "2026-10-20T10:00:00Z" },
];

test("Stop during the module preflight never starts a permanent-delete request", async () => {
	const started = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	let stopped = false;
	let deletions = 0;
	const fetch = substituteFetch(async (_url, init) => {
		if (init?.method === "DELETE") {
			deletions++;
			return Response.json({
				success: true,
				data: { deleted: true, id: "first" },
			});
		}
		started.resolve();
		await release.promise;
		return Response.json({
			success: true,
			data: { modules: [{ id: "empty-trash", enabled: true }] },
		});
	});
	try {
		const pending = emptyTrash(
			trashApi,
			"posts",
			entries,
			undefined,
			() => stopped,
		);
		await started.promise;
		stopped = true;
		release.resolve();
		expect(await pending).toEqual({
			deleted: 0,
			skipped: 0,
			total: 2,
			stopped: true,
		});
		expect(deletions).toBe(0);
	} finally {
		fetch.mockRestore();
	}
});

test("plugin deactivation stops the batch instead of reporting every entry as skipped", async () => {
	let deletions = 0;
	const fetch = substituteFetch(async (_url, init) => {
		if (init?.method === "DELETE") deletions++;
		return Response.json(
			{
				success: false,
				error: { code: "NOT_FOUND", message: "Plugin route not found" },
			},
			{ status: 404 },
		);
	});
	try {
		const result = await emptyTrash(trashApi, "posts", entries);
		expect(result.stopped).toBe(true);
		expect(result.skipped).toBe(0);
		expect(result.deleted).toBe(0);
		expect(result.error).toContain("deletion could not be confirmed");
		expect(deletions).toBe(0);
	} finally {
		fetch.mockRestore();
	}
});

test("an unexpected deletion identity stops the batch and reports the confirmed side effect", async () => {
	let deletions = 0;
	const fetch = substituteFetch(async (_url, init) => {
		if (init?.method !== "DELETE") {
			return Response.json({
				success: true,
				data: { modules: [{ id: "empty-trash", enabled: true }] },
			});
		}
		deletions++;
		return Response.json({
			success: true,
			data: { deleted: true, id: "another-entry" },
		});
	});
	try {
		const result = await emptyTrash(trashApi, "posts", entries);
		expect(result.stopped).toBe(true);
		expect(result.deleted).toBe(1);
		expect(result.error).toBe(
			"EmDash deleted an entry whose ID did not match the preview. The operation stopped. Review this collection before continuing.",
		);
		expect(deletions).toBe(1);
	} finally {
		fetch.mockRestore();
	}
});
