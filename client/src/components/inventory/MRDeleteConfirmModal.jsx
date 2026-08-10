const countLabel = (value, singular, plural = `${singular}s`) => {
    const safeValue = Number(value || 0);
    return `${safeValue} ${safeValue === 1 ? singular : plural}`;
};

export default function MRDeleteConfirmModal({
    isOpen,
    request,
    summary,
    confirmValue,
    onConfirmValueChange,
    onClose,
    onDelete,
    deleting = false
}) {
    if (!isOpen || !request) return null;

    const counts = summary?.counts || {};
    const blockers = Array.isArray(summary?.blockers) ? summary.blockers : [];
    const canDelete = Boolean(summary?.canDeepDelete) && confirmValue === request.requestNumber && !deleting;

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={deleting ? undefined : onClose}></div>
            <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-red-500/20 bg-surface-dark shadow-2xl">
                <div className="border-b border-red-500/10 bg-red-500/10 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-red-300">Destructive Action</p>
                            <h2 className="mt-2 text-2xl font-bold text-white">Delete {request.requestNumber}</h2>
                            <p className="mt-2 text-sm text-slate-300">
                                This will remove the material request and every linked downstream inventory record tied to it.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={deleting}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                <div className="space-y-5 px-6 py-6">
                    <div className="grid gap-4 rounded-xl border border-border-dark bg-background-dark/40 p-4 text-sm text-slate-300 md:grid-cols-2">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-secondary">Project</p>
                            <p className="mt-1 font-medium text-white">{request.project?.name || 'Unknown Project'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-secondary">Current Status</p>
                            <p className="mt-1 font-medium text-white">{summary?.requestStatus || request.status || 'Unknown'}</p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border-dark bg-background-dark/40 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-secondary">Cascade Summary</p>
                        <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                            <div>{countLabel(counts.lines, 'line')}</div>
                            <div>{countLabel(counts.storeBatches, 'store batch')}</div>
                            <div>{countLabel(counts.purchaseBatches, 'purchase batch')}</div>
                            <div>{countLabel(counts.purchaseOrders, 'purchase order')}</div>
                            <div>{countLabel(counts.purchaseInwards, 'purchase inward')}</div>
                            <div>{countLabel(counts.dispatches, 'dispatch')}</div>
                            <div>{countLabel(counts.stockMovements, 'stock movement')}</div>
                            <div>{countLabel(counts.purchaseOrderAllocations, 'PO allocation')}</div>
                        </div>
                    </div>

                    {blockers.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">Blocked</p>
                            <div className="mt-2 space-y-1 text-sm text-amber-100">
                                {blockers.map((blocker) => (
                                    <p key={blocker}>{blocker}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                        <p className="text-sm text-slate-200">
                            Type <span className="font-mono font-bold text-white">{request.requestNumber}</span> to enable deletion.
                        </p>
                        <input
                            type="text"
                            value={confirmValue}
                            onChange={(event) => onConfirmValueChange(event.target.value)}
                            disabled={deleting}
                            className="mt-3 h-11 w-full rounded-xl border border-border-dark bg-background-dark px-4 text-sm text-white outline-none transition-colors focus:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder={request.requestNumber}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border-dark bg-background-dark/30 px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={deleting}
                        className="rounded-lg px-4 py-2 text-sm font-bold text-slate-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={!canDelete}
                        className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900/40 disabled:text-red-200/50"
                    >
                        {deleting ? 'Deleting...' : 'Delete MR'}
                    </button>
                </div>
            </div>
        </div>
    );
}
