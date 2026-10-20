import { afterAll, beforeAll, expect, test } from "bun:test";
import { trashApi } from "../src/modules/empty-trash/api.js";
import {
	collectTrash,
	emptyTrash,
} from "../src/modules/empty-trash/workflow.js";
import { substituteFetch } from "./fetch.js";
import { HttpHost } from "./http-host.js";

const host = new HttpHost();
const modulesPath = "/_emdash/api/plugins/emdash-admin-tools/modules";
const configurePath = "/_emdash/api/plugins/emdash-admin-tools/configure";
type ModuleState = { modules: { id: string; enabled: boolean }[] };
type Item = { item: { id: string; status: string; data: { title: string } } };

beforeAll(async () => {
	await host.start();
	await host.login("admin");
	await host.login("editor");
}, 90_000);
afterAll(() => host.dispose(), 15_000);

const configure = (enabled: boolean) =>
	host.request<ModuleState>(configurePath, {
		method: "POST",
		body: JSON.stringify({ id: "empty-trash", enabled }),
	});
const create = async (collection: string, title: string) => {
	const result = await host.request<Item>(
		`/_emdash/api/content/${collection}`,
		{
			method: "POST",
			body: JSON.stringify({ data: { title }, status: "draft" }),
		},
	);
	return result.item.id;
};
const trash = (collection: string, id: string) =>
	host.request(`/_emdash/api/content/${collection}/${id}`, {
		method: "DELETE",
	});

/** Supply browser origin/session context while preserving the real HTTP boundary. */
async function asBrowser<T>(run: () => Promise<T>) {
	const transport = substituteFetch((input, init) => {
		if (typeof input !== "string" || !input.startsWith("/_emdash/")) {
			throw new Error("Unexpected request outside the disposable host.");
		}
		return host.raw(input, init, "admin", false);
	});
	try {
		return await run();
	} finally {
		transport.mockRestore();
	}
}

test("private module settings reject anonymous, non-admin, and CSRF-free writes without changing state", async () => {
	const original = await host.request<ModuleState>(modulesPath);
	expect(original.modules).toContainEqual(
		expect.objectContaining({ id: "empty-trash", enabled: true }),
	);
	const anonymous = await host.raw(modulesPath, {}, null);
	expect(anonymous.status).toBe(401);
	expect((await anonymous.json()).error.code).toBe("UNAUTHORIZED");
	for (const [actor, csrf, code] of [
		["editor", true, "FORBIDDEN"],
		["admin", false, "CSRF_REJECTED"],
	] as const) {
		const response = await host.raw(
			configurePath,
			{
				method: "POST",
				body: JSON.stringify({ id: "empty-trash", enabled: false }),
			},
			actor,
			csrf,
		);
		expect(response.status).toBe(403);
		expect((await response.json()).error.code).toBe(code);
	}
	expect(await host.request<ModuleState>(modulesPath)).toEqual(original);
});

test("module toggles survive a real host restart and host deactivation removes plugin routes", async () => {
	expect((await configure(false)).modules[0]?.enabled).toBe(false);
	await host.stop();
	await host.start();
	await host.login("admin");
	await host.login("editor");
	expect(
		(await host.request<ModuleState>(modulesPath)).modules[0]?.enabled,
	).toBe(false);
	const invalid = await host.raw(configurePath, {
		method: "POST",
		body: JSON.stringify({ id: "empty-trash", enabled: "yes" }),
	});
	expect(invalid.status).toBe(400);
	expect((await invalid.json()).error.code).toBe("BAD_REQUEST");
	expect(
		(await host.request<ModuleState>(modulesPath)).modules[0]?.enabled,
	).toBe(false);
	await host.request("/_emdash/api/admin/plugins/emdash-admin-tools/disable", {
		method: "POST",
	});
	const disabled = await host.raw(modulesPath);
	expect(disabled.status).toBe(404);
	expect((await disabled.json()).error.code).toBe("NOT_FOUND");
	await host.request("/_emdash/api/admin/plugins/emdash-admin-tools/enable", {
		method: "POST",
	});
	expect(
		(await host.request<ModuleState>(modulesPath)).modules[0]?.enabled,
	).toBe(false);
	await configure(true);
}, 90_000);

test("emptying a paginated snapshot preserves restored entries, live content, newly trashed entries, and other collections", async () => {
	await asBrowser(async () => {
		const live = await create("posts", "Keep this live post");
		const otherCollection = await create("pages", "Keep this trashed page");
		await trash("pages", otherCollection);
		const candidates: string[] = [];
		for (let index = 0; index < 102; index++) {
			const id = await create("posts", `Disposable trash ${index}`);
			await trash("posts", id);
			candidates.push(id);
		}
		const api = trashApi;
		const entries = await collectTrash(api, "posts");
		expect(entries.map((entry) => entry.id).sort()).toEqual(
			[...candidates].sort(),
		);
		const restored = candidates[0];
		const deniedTarget = candidates[1];
		if (!(restored && deniedTarget))
			throw new Error("Missing independently seeded targets.");
		await host.request(`/_emdash/api/content/posts/${restored}/restore`, {
			method: "POST",
		});
		const later = await create("posts", "Trashed after preview");
		await trash("posts", later);
		const denied = await host.raw(
			`/_emdash/api/content/posts/${deniedTarget}/permanent`,
			{ method: "DELETE" },
			"editor",
		);
		expect(denied.status).toBe(403);
		expect((await denied.json()).error.code).toBe("FORBIDDEN");
		expect(
			(await collectTrash(api, "posts")).some(
				(item) => item.id === deniedTarget,
			),
		).toBe(true);
		const result = await emptyTrash(api, "posts", entries);
		expect(result).toEqual({
			deleted: 101,
			skipped: 1,
			total: 102,
			stopped: false,
		});
		expect((await collectTrash(api, "posts")).map((item) => item.id)).toEqual([
			later,
		]);
		expect((await collectTrash(api, "pages")).map((item) => item.id)).toEqual([
			otherCollection,
		]);
		expect(
			(await host.request<Item>(`/_emdash/api/content/posts/${live}`)).item.data
				.title,
		).toBe("Keep this live post");
		expect(
			(await host.request<Item>(`/_emdash/api/content/posts/${restored}`)).item
				.status,
		).toBe("draft");
	});
}, 90_000);

test("a stale client cannot delete after the module or plugin is disabled", async () => {
	await asBrowser(async () => {
		const id = await create("posts", "Keep while disabled");
		await trash("posts", id);
		await configure(false);
		await expect(trashApi.remove("posts", id)).rejects.toMatchObject({
			code: "MODULE_DISABLED",
		});
		expect(
			(await collectTrash(trashApi, "posts")).some((item) => item.id === id),
		).toBe(true);
		await configure(true);
		await host.request(
			"/_emdash/api/admin/plugins/emdash-admin-tools/disable",
			{ method: "POST" },
		);
		await expect(trashApi.remove("posts", id)).rejects.toMatchObject({
			code: "MODULE_UNAVAILABLE",
		});
		expect(
			(await collectTrash(trashApi, "posts")).some((item) => item.id === id),
		).toBe(true);
		await host.request("/_emdash/api/admin/plugins/emdash-admin-tools/enable", {
			method: "POST",
		});
		await trashApi.remove("posts", id);
	});
});
