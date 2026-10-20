import { realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { adminTools } from "emdash-admin-tools";

const root = fileURLToPath(new URL("./", import.meta.url));
const pluginRoot = realpathSync(join(root, "node_modules/emdash-admin-tools"));

export default defineConfig({
	root,
	output: "server",
	adapter: node({ mode: "standalone" }),
	devToolbar: { enabled: false },
	cacheDir: join(root, "astro-cache"),
	session: { cookie: `admin-tools-${basename(root)}` },
	integrations: [
		react(),
		{
			name: "admin-tools-disposable-identities",
			hooks: {
				"astro:config:setup"({ command, injectRoute }) {
					if (command === "dev") {
						injectRoute({
							pattern: "/_emdash/api/setup/admin-tools/session/[actor]",
							entrypoint: join(root, "session.ts"),
						});
					}
				},
			},
		},
		emdash({
			database: sqlite({ url: `file:${join(root, "site.db")}` }),
			storage: local({
				directory: join(root, "media"),
				baseUrl: "/_emdash/api/media/file",
			}),
			plugins: [adminTools()],
		}),
	],
	server: { host: "127.0.0.1" },
	vite: {
		cacheDir: join(root, "vite-cache"),
		ssr: { noExternal: ["@astrojs/react"] },
		resolve: { dedupe: ["react", "react-dom", "emdash", "@emdash-cms/admin"] },
		server: {
			strictPort: true,
			fs: { allow: [root, pluginRoot], strict: true },
		},
	},
});
