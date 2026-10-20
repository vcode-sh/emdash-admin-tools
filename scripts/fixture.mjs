import { spawn } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
	const index = args.indexOf(name);
	return index === -1 ? undefined : args[index + 1];
};
const suppliedDirectory = option("--directory");
const root = suppliedDirectory
	? resolve(suppliedDirectory)
	: mkdtempSync(join(tmpdir(), "emdash-admin-tools-"));
const requestedPort = Number(option("--port") ?? 0);
if (
	!Number.isInteger(requestedPort) ||
	requestedPort < 0 ||
	requestedPort > 65535
) {
	throw new Error("--port must be an integer between 0 and 65535.");
}
if (!existsSync(join(packageRoot, "dist/index.mjs"))) {
	throw new Error("Run bun run build before starting the disposable fixture.");
}
mkdirSync(root, { recursive: true });
const ownershipMarker = join(root, ".admin-tools-disposable-host");
if (readdirSync(root).length > 0 && !existsSync(ownershipMarker)) {
	throw new Error(
		"--directory must be empty or an existing Admin Tools disposable fixture.",
	);
}
writeFileSync(ownershipMarker, "Disposable EmDash Admin Tools fixture\n");
cpSync(join(packageRoot, "fixtures"), root, { recursive: true });
writeFileSync(
	join(root, "package.json"),
	JSON.stringify(
		{
			name: "emdash-admin-tools-disposable-host",
			private: true,
			type: "module",
			emdash: { seed: "seed/seed.json" },
			dependencies: {
				emdash: "1.3.0",
				"emdash-admin-tools": "0.1.0",
				astro: "7.4.0",
				react: "19.3.1",
			},
		},
		null,
		2,
	),
);
const nodeModules = join(root, "node_modules");
mkdirSync(nodeModules, { recursive: true });
for (const name of readdirSync(join(packageRoot, "node_modules"))) {
	const destination = join(nodeModules, name);
	if (!existsSync(destination))
		symlinkSync(join(packageRoot, "node_modules", name), destination, "dir");
}
if (!existsSync(join(nodeModules, "emdash-admin-tools"))) {
	symlinkSync(packageRoot, join(nodeModules, "emdash-admin-tools"), "dir");
}
const probe = createServer();
await new Promise((resolveListening, reject) => {
	probe.once("error", reject);
	probe.listen(requestedPort, "127.0.0.1", resolveListening);
});
const port = probe.address().port;
await new Promise((resolveClosed) => probe.close(resolveClosed));
const environment = {
	PATH: process.env.PATH,
	HOME: process.env.HOME,
	TMPDIR: tmpdir(),
	NODE_ENV: "development",
	ASTRO_TELEMETRY_DISABLED: "1",
};
const child = spawn(
	process.execPath,
	[
		join(packageRoot, "node_modules/astro/bin/astro.mjs"),
		"dev",
		"--host",
		"127.0.0.1",
		"--port",
		String(port),
	],
	{ cwd: root, env: environment, stdio: "inherit" },
);
console.log(
	`ADMIN_TOOLS_FIXTURE ${JSON.stringify({ directory: root, url: `http://127.0.0.1:${port}` })}`,
);
console.log(
	`Browser setup: http://127.0.0.1:${port}/_emdash/api/setup/dev-bypass?content=0&redirect=/_emdash/admin/plugins/emdash-admin-tools/`,
);
let stopping = false;
const stop = () => {
	if (stopping) return;
	stopping = true;
	child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.once("exit", (code) => {
	if (!suppliedDirectory) rmSync(root, { recursive: true, force: true });
	process.exit(stopping ? 0 : (code ?? 1));
});
child.once("error", (error) => {
	console.error(error.message);
	if (!suppliedDirectory) rmSync(root, { recursive: true, force: true });
	process.exit(1);
});
