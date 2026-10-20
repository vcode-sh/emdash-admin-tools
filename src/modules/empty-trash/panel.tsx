import { useEffect, useRef, useState } from "react";
import styles from "../../admin/styles.module.css";
import { type Collection, type TrashEntry, trashApi } from "./api.js";
import { TrashOperation } from "./operation.js";
import {
	collectTrash,
	emptyTrash,
	type TrashProgress,
	type TrashResult,
} from "./workflow.js";

export function EmptyTrashPanel({
	onBusyChange,
}: {
	onBusyChange: (busy: boolean) => void;
}) {
	const [collections, setCollections] = useState<Collection[]>();
	const [collection, setCollection] = useState("");
	const [preview, setPreview] = useState<TrashEntry[] | null>(null);
	const [activity, setActivity] = useState<"idle" | "previewing" | "running">(
		"idle",
	);
	const [progress, setProgress] = useState<TrashProgress>();
	const [result, setResult] = useState<TrashResult>();
	const [error, setError] = useState("");
	const [stopping, setStopping] = useState(false);
	const mounted = useRef(false);
	const locked = useRef(false);
	const stop = useRef(false);
	const errorRef = useRef<HTMLParagraphElement>(null);
	const previewButton = useRef<HTMLButtonElement>(null);
	const busy = activity !== "idle";
	const label =
		collections?.find((item) => item.slug === collection)?.label ?? collection;

	useEffect(() => {
		mounted.current = true;
		trashApi
			.collections()
			.then((items) => {
				if (!mounted.current) return;
				setCollections(items);
				setCollection(items[0]?.slug ?? "");
			})
			.catch((cause: unknown) => {
				if (mounted.current)
					setError(
						cause instanceof Error
							? cause.message
							: "Could not load collections.",
					);
			});
		return () => {
			mounted.current = false;
			stop.current = true;
		};
	}, []);

	useEffect(() => {
		if (error) errorRef.current?.focus();
	}, [error]);

	function finish() {
		locked.current = false;
		if (!mounted.current) return;
		setActivity("idle");
		onBusyChange(false);
	}

	async function loadPreview() {
		if (locked.current || !collection) return;
		locked.current = true;
		setActivity("previewing");
		onBusyChange(true);
		setError("");
		setPreview(null);
		setResult(undefined);
		try {
			const entries = await collectTrash(trashApi, collection);
			if (mounted.current) setPreview(entries);
		} catch (cause) {
			if (mounted.current)
				setError(
					cause instanceof Error
						? cause.message
						: "Could not load the trash. No entries were deleted.",
				);
		} finally {
			finish();
		}
	}

	async function run() {
		if (locked.current || !preview?.length) return;
		locked.current = true;
		stop.current = false;
		setStopping(false);
		setActivity("running");
		onBusyChange(true);
		setError("");
		setProgress({ deleted: 0, skipped: 0, total: preview.length });
		const entries = preview;
		setPreview(null);
		try {
			const outcome = await emptyTrash(
				trashApi,
				collection,
				entries,
				(value) => {
					if (mounted.current) setProgress(value);
				},
				() => stop.current,
			);
			if (mounted.current) setResult(outcome);
		} finally {
			finish();
		}
	}

	return (
		<div className={styles.panel}>
			<p className={styles.muted}>
				Empty the trash for one collection, across all languages. Review the
				count before deleting.
			</p>
			{error && (
				<p className={styles.error} role="alert" ref={errorRef} tabIndex={-1}>
					{error}
				</p>
			)}
			{!collections && !error && <p role="status">Loading collections…</p>}
			{collections?.length === 0 && (
				<p>No content collections are available.</p>
			)}
			{!!collections?.length && (
				<div className={styles.controls}>
					<label className={styles.field}>
						<span>Collection</span>
						<select
							value={collection}
							disabled={busy}
							onChange={(event) => {
								setCollection(event.target.value);
								setPreview(null);
								setResult(undefined);
								setError("");
							}}
						>
							{collections.map((item) => (
								<option key={item.slug} value={item.slug}>
									{item.label}
								</option>
							))}
						</select>
					</label>
					<button
						className={styles.button}
						type="button"
						disabled={busy || !collection}
						ref={previewButton}
						onClick={() => void loadPreview()}
					>
						{activity === "previewing" ? "Counting entries…" : "Preview trash"}
					</button>
				</div>
			)}
			<TrashOperation
				count={preview?.length}
				label={label}
				progress={activity === "running" ? progress : undefined}
				result={result}
				stopping={stopping}
				onConfirm={() => void run()}
				onCancel={() => {
					setPreview(null);
					previewButton.current?.focus();
				}}
				onStop={() => {
					stop.current = true;
					setStopping(true);
				}}
			/>
		</div>
	);
}
