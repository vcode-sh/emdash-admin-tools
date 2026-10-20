import { definePlugin, type PluginDescriptor } from "emdash";
import { version } from "../package.json";
import { moduleRoutes, settingsSchema } from "./settings.js";

const id = "emdash-admin-tools";
const adminEntry = "emdash-admin-tools/admin";

export function adminTools(): PluginDescriptor {
	return { id, version, format: "native", entrypoint: id, adminEntry };
}

export function createPlugin() {
	return definePlugin({
		id,
		version,
		admin: {
			entry: adminEntry,
			pages: [{ path: "/", label: "Admin Tools", icon: "toolbox" }],
			settingsSchema,
		},
		routes: moduleRoutes,
	});
}
