import {
	type PluginContext,
	type PluginRoute,
	PluginRouteError,
	type SettingField,
} from "emdash";
import { modules } from "./modules/registry.js";

export async function readModules(ctx: Pick<PluginContext, "settings">) {
	return {
		modules: await Promise.all(
			modules.map(async (module) => {
				const stored = await ctx.settings.get<unknown>(module.setting);
				if (
					stored !== null &&
					stored !== undefined &&
					typeof stored !== "boolean"
				) {
					throw PluginRouteError.internal(
						"An Admin Tools setting is invalid. Review the plugin settings.",
					);
				}
				return { ...module, enabled: stored ?? module.defaultEnabled };
			}),
		),
	};
}

export const settingsSchema: Record<string, SettingField> = Object.fromEntries(
	modules.map((module) => [
		module.setting,
		{
			type: "boolean",
			label: module.label,
			description: module.description,
			default: module.defaultEnabled,
		},
	]),
);

export const moduleRoutes = {
	modules: {
		methods: ["GET"],
		permission: "plugins:manage",
		request: { body: "none" },
		handler: readModules,
	},
	configure: {
		methods: ["POST"],
		permission: "plugins:manage",
		request: { body: "json", maxBytes: 1024 },
		async handler(ctx) {
			const input = ctx.input;
			if (
				!input ||
				typeof input !== "object" ||
				!("id" in input) ||
				!("enabled" in input) ||
				typeof input.enabled !== "boolean"
			) {
				throw PluginRouteError.badRequest(
					"Choose a module and an enabled state.",
				);
			}
			const module = modules.find((item) => item.id === input.id);
			if (!module)
				throw PluginRouteError.badRequest("Unknown Admin Tools module.");
			await ctx.settings.set(module.setting, input.enabled);
			return readModules(ctx);
		},
	},
} satisfies Record<string, PluginRoute>;
