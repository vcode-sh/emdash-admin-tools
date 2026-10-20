import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

type Actor = "admin" | "editor";
const nativeFetch = globalThis.fetch;
type Envelope<T> =
	| { success: true; data: T }
	| { success: false; error: { code: string; message: string } };

export class HttpHost {
	readonly directory = mkdtempSync(join(tmpdir(), "emdash-admin-tools-test-"));
	url = "";
	private child?: ChildProcessWithoutNullStreams;
	private logs = "";
	private cookies = new Map<Actor, string>();

	async start() {
		const localNode = join(homedir(), ".nvm/versions/node/v24.18.0/bin/node");
		const node =
			process.env.ADMIN_TOOLS_NODE ??
			(existsSync(localNode) ? localNode : Bun.which("node"));
		if (!node)
			throw new Error("Node.js is required for the disposable EmDash host.");
		this.logs = "";
		this.url = "";
		this.child = spawn(
			node,
			["scripts/fixture.mjs", "--directory", this.directory],
			{
				cwd: import.meta.dir.replace(/\/tests$/, ""),
				stdio: "pipe",
			},
		);
		this.child.stdout.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			this.logs = `${this.logs}${text}`.slice(-12_000);
			const marker = text.match(/ADMIN_TOOLS_FIXTURE (\{[^\n]+\})/);
			if (marker?.[1]) this.url = JSON.parse(marker[1]).url;
		});
		this.child.stderr.on("data", (chunk: Buffer) => {
			this.logs = `${this.logs}${chunk}`.slice(-12_000);
		});
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			if (this.child.exitCode !== null)
				throw new Error(`Fixture exited:\n${this.logs}`);
			if (this.logs.includes("Failed to create the dev server app")) {
				throw new Error(`Fixture bootstrap failed:\n${this.logs}`);
			}
			if (this.url) {
				try {
					const response = await fetch(this.url, {
						signal: AbortSignal.timeout(1000),
					});
					if (response.ok) return;
				} catch {
					/* Poll the observable HTTP readiness boundary. */
				}
			}
			await Bun.sleep(100);
		}
		throw new Error(`Fixture did not become ready:\n${this.logs}`);
	}

	async login(actor: Actor) {
		const response = await fetch(
			`${this.url}/_emdash/api/setup/admin-tools/session/${actor}`,
		);
		if (!response.ok)
			throw new Error(
				`Fixture login failed: ${await response.text()}\n${this.logs}`,
			);
		const cookie = response.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		if (!cookie) throw new Error("Fixture login returned no session cookie.");
		this.cookies.set(actor, cookie);
	}

	raw(
		path: string,
		init: RequestInit = {},
		actor: Actor | null = "admin",
		csrf = true,
	) {
		const headers = new Headers(init.headers);
		if (actor) headers.set("Cookie", this.cookies.get(actor) ?? "");
		if (csrf) headers.set("X-EmDash-Request", "1");
		if (init.body) headers.set("Content-Type", "application/json");
		return nativeFetch(`${this.url}${path}`, {
			...init,
			headers,
			redirect: "manual",
		});
	}

	async request<T>(
		path: string,
		init?: RequestInit,
		actor: Actor | null = "admin",
	) {
		const response = await this.raw(path, init, actor);
		const body: Envelope<T> = await response.json();
		if (!body.success || !response.ok) {
			throw new Error(
				`${response.status}: ${JSON.stringify(body)}\n${this.logs}`,
			);
		}
		return body.data;
	}

	async stop() {
		const child = this.child;
		if (!child || child.exitCode !== null) return;
		await new Promise<void>((resolveStop) => {
			child.once("exit", () => resolveStop());
			child.kill("SIGTERM");
		});
		this.child = undefined;
	}

	async dispose() {
		await this.stop();
		rmSync(this.directory, { recursive: true, force: true });
	}
}
