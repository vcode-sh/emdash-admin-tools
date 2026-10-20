import { useEffect, useRef } from "react";
import styles from "../../admin/styles.module.css";
import type { TrashProgress, TrashResult } from "./workflow.js";

interface Props {
	count: number | undefined;
	label: string;
	progress: TrashProgress | undefined;
	result: TrashResult | undefined;
	stopping: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	onStop: () => void;
}

export function TrashOperation({
	count,
	label,
	progress,
	result,
	stopping,
	onConfirm,
	onCancel,
	onStop,
}: Props) {
	const noticeRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (count !== undefined || result) noticeRef.current?.focus();
	}, [count, result]);

	if (count !== undefined)
		return (
			<div
				className={count ? styles.confirmation : styles.notice}
				ref={noticeRef}
				tabIndex={-1}
			>
				{count ? (
					<>
						<h3>
							Permanently delete {count} {count === 1 ? "entry" : "entries"}{" "}
							from {label}?
						</h3>
						<p>
							This cannot be undone. Associated comments and revisions are
							deleted. Media files remain in the media library.
						</p>
						<p>
							Keep this page open until the operation finishes. Avoid changes to
							this collection in other tabs or by other administrators while
							deleting: EmDash does not lock the preview.
						</p>
						<div className={styles.actions}>
							<button
								type="button"
								className={styles.dangerButton}
								onClick={onConfirm}
							>
								Permanently delete {count} {count === 1 ? "entry" : "entries"}
							</button>
							<button
								type="button"
								className={styles.button}
								onClick={onCancel}
							>
								Cancel
							</button>
						</div>
					</>
				) : (
					<p role="status">The trash for {label} is empty.</p>
				)}
			</div>
		);
	if (result)
		return (
			<div
				className={result.error ? styles.confirmation : styles.notice}
				ref={noticeRef}
				tabIndex={-1}
				role={result.error ? "alert" : "status"}
			>
				<h3>{result.stopped ? "Operation stopped" : "Batch complete"}</h3>
				<p>
					{result.deleted} deleted · {result.skipped} skipped ·{" "}
					{result.total - result.deleted - result.skipped}{" "}
					{result.error ? "not confirmed" : "unprocessed"}
				</p>
				{result.skipped > 0 && (
					<p>Skipped entries were restored or already deleted.</p>
				)}
				<p>
					{result.error ??
						"Preview the trash again to check its current contents."}
				</p>
			</div>
		);
	if (progress)
		return (
			<div className={styles.notice}>
				<p role="status">
					{progress.deleted} deleted · {progress.skipped} skipped ·{" "}
					{progress.total} in this batch
				</p>
				<progress
					className={styles.progress}
					value={progress.deleted + progress.skipped}
					max={progress.total}
					aria-label="Trash entries processed"
				/>
				<p>
					Keep this page open. Stopping allows the current request to finish,
					then prevents further deletions.
				</p>
				<button
					type="button"
					className={styles.button}
					disabled={stopping}
					onClick={onStop}
				>
					{stopping ? "Stopping…" : "Stop deleting"}
				</button>
			</div>
		);
	return null;
}
