import { useEffect, useMemo, useState } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

const getEntityId = (value) => value?.id || value?._id || '';

export default function ProjectReturnReview({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const { success: notifySuccess, error: notifyError } = useNotifier();
    const currentPage = propCurrentPage || 'project-return-review';
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [remarks, setRemarks] = useState('');

    const fetchBatches = async () => {
        try {
            setLoading(true);
            const response = await inventoryService.getProjectReturns();
            setBatches(response.data || []);
            setSelectedBatchId((prev) => prev || getEntityId(response.data?.[0]));
        } catch (err) {
            notifyError(err.response?.data?.message || 'Failed to load project return batches.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBatches();
    }, []);

    const selectedBatch = useMemo(
        () => batches.find((batch) => getEntityId(batch) === selectedBatchId) || null,
        [batches, selectedBatchId]
    );

    const pendingBatches = useMemo(
        () => batches.filter((batch) => batch.status === 'SUBMITTED'),
        [batches]
    );

    const handleDecision = async (decision) => {
        if (!selectedBatch) return;
        try {
            setProcessing(true);
            if (decision === 'APPROVE') {
                await inventoryService.approveProjectReturn(getEntityId(selectedBatch), remarks);
            } else {
                await inventoryService.rejectProjectReturn(getEntityId(selectedBatch), remarks);
            }
            notifySuccess(`Project return ${decision.toLowerCase()}d successfully.`);
            setRemarks('');
            await fetchBatches();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Unable to process project return.');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Project Return Review</h1>
                        <p className="text-text-secondary">Review good and damaged materials coming back from project teams.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-8">
                        <div className="space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar pr-2">
                            {loading ? (
                                <div className="p-16 rounded-2xl border border-border-dark bg-surface-dark text-center">
                                    <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                                    <p className="text-text-secondary text-sm">Loading project returns...</p>
                                </div>
                            ) : batches.length === 0 ? (
                                <div className="p-16 rounded-2xl border border-dashed border-border-dark bg-surface-dark text-center">
                                    <span className="material-symbols-outlined text-border-dark text-6xl mb-4">assignment_turned_in</span>
                                    <p className="text-text-secondary">No project return batches are available yet.</p>
                                </div>
                            ) : (
                                batches.map((batch) => (
                                    <button
                                        key={getEntityId(batch)}
                                        onClick={() => setSelectedBatchId(getEntityId(batch))}
                                        className={`w-full text-left rounded-2xl border p-5 transition-all ${
                                            selectedBatchId === getEntityId(batch)
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                                : 'border-border-dark bg-surface-dark hover:border-text-secondary/30'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div>
                                                <div className="text-white font-bold">{batch.returnNumber}</div>
                                                <div className="text-sm text-text-secondary">{batch.project?.name || 'Project'}</div>
                                            </div>
                                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                                                batch.status === 'APPROVED'
                                                    ? 'bg-emerald-500/20 text-emerald-300'
                                                    : batch.status === 'REJECTED'
                                                    ? 'bg-red-500/20 text-red-300'
                                                    : 'bg-amber-500/20 text-amber-300'
                                            }`}>
                                                {batch.status}
                                            </span>
                                        </div>
                                        <div className="text-xs text-text-secondary">
                                            Submitted by {batch.submittedBy?.name || 'Unknown'} | {batch.lines?.length || 0} line(s)
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        <div>
                            {selectedBatch ? (
                                <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="p-6 border-b border-border-dark bg-gradient-surface">
                                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                            <div>
                                                <h2 className="text-2xl font-bold text-white">{selectedBatch.returnNumber}</h2>
                                                <p className="text-text-secondary">{selectedBatch.project?.name || 'Project'} | Return to {selectedBatch.destinationLocation?.name || 'Warehouse'}</p>
                                            </div>
                                            <div className="text-sm text-text-secondary">
                                                Submitted by {selectedBatch.submittedBy?.name || 'Unknown'} on {new Date(selectedBatch.createdAt).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6 space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="rounded-xl border border-border-dark bg-background-dark/40 p-4">
                                                <div className="text-[10px] uppercase font-black text-text-secondary mb-1">Status</div>
                                                <div className="text-white font-bold">{selectedBatch.status}</div>
                                            </div>
                                            <div className="rounded-xl border border-border-dark bg-background-dark/40 p-4">
                                                <div className="text-[10px] uppercase font-black text-text-secondary mb-1">Pending Queue</div>
                                                <div className="text-white font-bold">{pendingBatches.length} batch(es)</div>
                                            </div>
                                            <div className="rounded-xl border border-border-dark bg-background-dark/40 p-4">
                                                <div className="text-[10px] uppercase font-black text-text-secondary mb-1">Summary</div>
                                                <div className="text-white font-bold">
                                                    {(selectedBatch.lines || []).reduce((sum, line) => sum + Number(line.goodQuantity || 0) + Number(line.damagedQuantity || 0), 0)} qty
                                                </div>
                                            </div>
                                        </div>

                                        {selectedBatch.overallRemarks && (
                                            <div className="rounded-xl border border-border-dark bg-background-dark/40 p-4">
                                                <div className="text-[10px] uppercase font-black text-text-secondary mb-2">Overall Remarks</div>
                                                <div className="text-white/90 text-sm">{selectedBatch.overallRemarks}</div>
                                            </div>
                                        )}

                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm">
                                                <thead>
                                                    <tr className="text-text-secondary text-[10px] uppercase font-bold border-b border-border-dark">
                                                        <th className="pb-3">Item</th>
                                                        <th className="pb-3 text-center">Good</th>
                                                        <th className="pb-3 text-center">Damaged</th>
                                                        <th className="pb-3">Responsible Team</th>
                                                        <th className="pb-3">Damage Reason</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border-dark">
                                                    {(selectedBatch.lines || []).map((line) => (
                                                        <tr key={getEntityId(line)}>
                                                            <td className="py-4">
                                                                <div className="text-white font-medium">{line.item?.name || line.itemId?.name}</div>
                                                                <div className="text-primary text-[10px]">{line.item?.itemCode || line.itemId?.itemCode}</div>
                                                                {line.remarks && <div className="text-text-secondary text-xs mt-1">{line.remarks}</div>}
                                                            </td>
                                                            <td className="py-4 text-center text-emerald-300 font-bold">{line.goodQuantity || 0}</td>
                                                            <td className="py-4 text-center text-amber-300 font-bold">{line.damagedQuantity || 0}</td>
                                                            <td className="py-4 text-text-secondary">{line.responsibleTeam || '-'}</td>
                                                            <td className="py-4 text-text-secondary">{line.damageReason || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {selectedBatch.status === 'SUBMITTED' ? (
                                            <div className="space-y-4 pt-4 border-t border-border-dark">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-text-secondary uppercase mb-2">Review Remarks</label>
                                                    <textarea
                                                        className="w-full bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-1 focus:ring-primary h-24"
                                                        placeholder="Optional review note for approval or rejection..."
                                                        value={remarks}
                                                        onChange={(e) => setRemarks(e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex gap-3 justify-end">
                                                    <button
                                                        type="button"
                                                        disabled={processing}
                                                        onClick={() => handleDecision('REJECT')}
                                                        className="px-6 py-3 rounded-xl border border-red-500/50 text-red-400 font-bold hover:bg-red-500/10 transition-all disabled:opacity-50"
                                                    >
                                                        Reject
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={processing}
                                                        onClick={() => handleDecision('APPROVE')}
                                                        className="px-8 py-3 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all disabled:opacity-50"
                                                    >
                                                        Approve
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="rounded-xl border border-border-dark bg-background-dark/40 p-4">
                                                <div className="text-[10px] uppercase font-black text-text-secondary mb-2">Reviewed</div>
                                                <div className="text-white text-sm">
                                                    {selectedBatch.reviewedBy?.name || 'System'} on {selectedBatch.reviewedAt ? new Date(selectedBatch.reviewedAt).toLocaleString() : 'N/A'}
                                                </div>
                                                {selectedBatch.reviewRemarks && (
                                                    <div className="text-text-secondary text-sm mt-2">{selectedBatch.reviewRemarks}</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-16 rounded-2xl border border-dashed border-border-dark bg-surface-dark text-center">
                                    <span className="material-symbols-outlined text-border-dark text-6xl mb-4">inventory_2</span>
                                    <p className="text-text-secondary">Select a project return batch to review.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
