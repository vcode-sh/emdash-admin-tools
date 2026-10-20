export const modules = [
	{
		id: "empty-trash",
		label: "Empty Trash",
		description:
			"Permanently delete trashed entries from a selected collection.",
		setting: "emptyTrashEnabled",
		defaultEnabled: true,
	},
] as const;

export type ModuleId = (typeof modules)[number]["id"];
export type ModuleState = (typeof modules)[number] & { enabled: boolean };
