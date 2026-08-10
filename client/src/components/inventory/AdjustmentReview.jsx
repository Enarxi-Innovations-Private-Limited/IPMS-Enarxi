import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function AdjustmentReview() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [remarks, setRemarks] = useState('');

    useEffect(() => {
        fetchBatches();
    }, []);

    const fetchBatches = async () => {
        try {
            setLoading(true);
            const res = await inventoryService.getStockAdjustments();
            // Show only submitted ones
            setBatches(res.data.filter(b => b.status === 'SUBMITTED'));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDecision = async (id, decision) => {
        try {
            setProcessing(true);
            if (decision === 'APPROVE') {
                await inventoryService.approveStockAdjustment(id, remarks);
            } else {
                await inventoryService.rejectStockAdjustment(id, remarks);
            }
            notifySuccess(`Batch ${decision.toLowerCase()}d successfully.`);
            setRemarks('');
            fetchBatches();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Action failed');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Layout currentPage="inv-approvals">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Stock Adjustment Review</h1>
                        <p className="text-text-secondary">Approve or reject manual inventory corrections and reconciliations.</p>
                    </div>

                    <div className="space-y-6">
                        {loading ? (
                            <div className="p-20 text-center">
                                <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                            </div>
                        ) : batches.length === 0 ? (
                            <div className="p-20 text-center bg-surface-dark rounded-2xl border border-dashed border-border-dark">
                                <span className="material-symbols-outlined text-border-dark text-6xl mb-4">verified</span>
                                <p className="text-text-secondary font-medium tracking-wide">No pending adjustment batches found in the queue.</p>
                            </div>
                        ) : (
                            batches.map(batch => (
                                <div key={batch.id} className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-xl">
                                    <div className="p-6 border-b border-border-dark bg-gradient-surface flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                                    batch.batchType === 'RECONCILIATION' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                                                }`}>
                                                    {batch.batchType}
                                                </span>
                                                <h3 className="text-lg font-bold text-white">Batch #{batch.id.slice(-6)}</h3>
                                            </div>
                                            <p className="text-text-secondary text-sm">Uploaded by {batch.uploadedBy?.name} on {new Date(batch.createdAt).toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-text-secondary text-[10px] font-bold uppercase mb-1">Reason</div>
                                            <div className="text-white text-sm italic">"{batch.reason || 'Not specified'}"</div>
                                        </div>
                                    </div>

                                    <div className="p-6">
                                        <table className="w-full text-left text-sm mb-6">
                                            <thead>
                                                <tr className="text-text-secondary text-[10px] uppercase font-bold border-b border-border-dark">
                                                    <th className="pb-3">Component</th>
                                                    <th className="pb-3">Location</th>
                                                    <th className="pb-3 text-center">System Qty</th>
                                                    <th className="pb-3 text-center">Physical Qty</th>
                                                    <th className="pb-3 text-right">Adjustment</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark">
                                                {batch.lines?.map(line => (
                                                    <tr key={line.id}>
                                                        <td className="py-4">
                                                            <div className="text-white font-medium">{line.item?.name}</div>
                                                            <div className="text-primary text-[10px]">{line.item?.itemCode}</div>
                                                        </td>
                                                        <td className="py-4 text-text-secondary">{line.location?.name}</td>
                                                        <td className="py-4 text-center text-text-secondary">{line.systemQuantity}</td>
                                                        <td className="py-4 text-center text-white font-bold">{line.uploadedQuantity}</td>
                                                        <td className="py-4 text-right">
                                                            <span className={`font-bold ${line.adjustmentQuantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                {line.adjustmentQuantity > 0 ? '+' : ''}{line.adjustmentQuantity}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        <div className="flex flex-col md:flex-row gap-4 items-end">
                                            <div className="flex-1 w-full">
                                                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-2">Admin Remarks</label>
                                                <input 
                                                    className="w-full bg-background-dark border border-border-dark rounded-xl px-4 py-3 text-white outline-none focus:ring-1 focus:ring-primary transition-all"
                                                    placeholder="Reason for approval/rejection..."
                                                    value={remarks}
                                                    onChange={(e) => setRemarks(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    disabled={processing}
                                                    onClick={() => handleDecision(batch.id, 'REJECT')}
                                                    className="px-6 py-3 rounded-xl border border-red-500/50 text-red-400 font-bold hover:bg-red-500/10 transition-all"
                                                >
                                                    Reject
                                                </button>
                                                <button 
                                                    disabled={processing}
                                                    onClick={() => handleDecision(batch.id, 'APPROVE')}
                                                    className="px-8 py-3 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all"
                                                >
                                                    Approve
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
