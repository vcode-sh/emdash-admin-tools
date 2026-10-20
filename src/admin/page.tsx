import { type ComponentType, useEffect, useRef, useState } from "react";
import { EmptyTrashPanel } from "../modules/empty-trash/panel.js";
import type { ModuleId, ModuleState } from "../modules/registry.js";
import { pluginApi, request } from "./api.js";
import styles from "./styles.module.css";

const panels: Record<
	ModuleId,
	ComponentType<{ onBusyChange: (busy: boolean) => void }>
> = { "empty-trash": EmptyTrashPanel };

export function AdminToolsPage() {
	const [modules, setModules] = useState<ModuleState[]>();
	const [pending, setPending] = useState<ModuleId>();
	const [busy, setBusy] = useState<Partial<Record<ModuleId, boolean>>>({});
	const [error, setError] = useState("");
	const errorRef = useRef<HTMLParagraphElement>(null);
	const mounted = useRef(false);
	const saving = useRef(false);

	useEffect(() => {
		mounted.current = true;
		request<{ modules: ModuleState[] }>(`${pluginApi}/modules`)
			.then((data) => {
				if (mounted.current) setModules(data.modules);
			})
			.catch((cause: unknown) => {
				if (mounted.current)
					setError(
						cause instanceof Error
							? cause.message
							: "Could not load admin tools.",
					);
			});
		return () => {
			mounted.current = false;
		};
	}, []);

	useEffect(() => {
		if (error) errorRef.current?.focus();
	}, [error]);

	async function configure(module: ModuleState) {
		if (saving.current || busy[module.id]) return;
		saving.current = true;
		setPending(module.id);
		setError("");
		try {
			const data = await request<{ modules: ModuleState[] }>(
				`${pluginApi}/configure`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ id: module.id, enabled: !module.enabled }),
				},
			);
			if (mounted.current) setModules(data.modules);
		} catch (cause) {
			if (mounted.current)
				setError(
					cause instanceof Error
						? cause.message
						: "Could not save the module setting.",
				);
		} finally {
			saving.current = false;
			if (mounted.current) setPending(undefined);
		}
	}

	return (
		<section className={styles.page} aria-labelledby="admin-tools-title">
			<header className={styles.heading}>
				<h1 id="admin-tools-title">Admin Tools</h1>
				<p>Choose the tools you need for everyday administration.</p>
			</header>
			{error && (
				<p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>
					{error}
				</p>
			)}
			{!modules && !error && <p role="status">Loading admin tools…</p>}
			{modules?.map((module) => {
				const Panel = panels[module.id];
				return (
					<section
						key={module.id}
						className={styles.card}
						aria-labelledby={`${module.id}-title`}
					>
						<div className={styles.moduleHeader}>
							<div>
								<h2 id={`${module.id}-title`}>{module.label}</h2>
								<p className={styles.muted}>{module.description}</p>
							</div>
							<label className={styles.toggle}>
								<input
									type="checkbox"
									checked={module.enabled}
									disabled={pending !== undefined || busy[module.id]}
									onChange={() => void configure(module)}
									aria-label={`Enable ${module.label}`}
								/>
								<span>
									{pending === module.id
										? "Saving…"
										: module.enabled
											? "Enabled"
											: "Disabled"}
								</span>
							</label>
						</div>
						{module.enabled ? (
							<fieldset
								className={styles.moduleContent}
								disabled={pending === module.id}
								aria-labelledby={`${module.id}-title`}
							>
								<Panel
									onBusyChange={(value) =>
										setBusy((current) => ({ ...current, [module.id]: value }))
									}
								/>
							</fieldset>
						) : (
							<p className={styles.disabled}>
								Enable this module to use its tools.
							</p>
						)}
					</section>
				);
			})}
		</section>
	);
}
