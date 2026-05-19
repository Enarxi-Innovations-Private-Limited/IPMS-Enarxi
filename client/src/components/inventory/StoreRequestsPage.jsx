import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';
import { getCurrentUser } from '../../services/authService';

const getEntityId = (value) => value?.id || value?._id || '';

export default function StoreRequestsPage() {
    const Layout = usePortalLayout();
    const user = getCurrentUser();
    const role = (user?.role || '').toUpperCase().replace(/\s+/g, '_');
    const isAdmin = ['SUPER_ADMIN', 'SUPER_USER', 'ADMIN'].includes(role);
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [batches, setBatches] = useState([]);
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [adminRemarks, setAdminRemarks] = useState('');
    const [lineQuantities, setLineQuantities] = useState({});
    const [lineRemarks, setLineRemarks] = useState({});
    const [stockLevels, setStockLevels] = useState({});
    const getDispatchableQty = (line) => (line?.status === 'CONFIRMED' ? Math.max(0, Number(line.pendingQuantity || 0)) : 0);

    useEffect(() => {
        if (selectedBatch) {
            const initialQty = {};
            const initialRem = {};
            selectedBatch.lines.forEach(line => {
                const id = getEntityId(line);
                // For reported shortages or confirmed lines, use the confirmedQuantity
                initialQty[id] = ['CONFIRMED', 'SHORTAGE_REPORTED', 'SHORTAGE_APPROVED'].includes(line.status)
                    ? line.confirmedQuantity
                    : (line.pendingQuantity || line.requestedQuantity || 0);
                initialRem[id] = line.shortageReason || '';
            });
            setLineQuantities(initialQty);
            setLineRemarks(initialRem);
        } else {
            setLineQuantities({});
            setLineRemarks({});
        }
    }, [selectedBatch]);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const [res, stockRes] = await Promise.all([
                inventoryService.getStoreRequests(),
                inventoryService.getCurrentStock()
            ]);
            setBatches([...res.data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));

            // Build stock map
            const stockMap = {};
            stockRes.data.forEach(item => {
                const id = getEntityId(item.itemId) || item.itemId;
                stockMap[id] = (stockMap[id] || 0) + (item.availableQuantity || 0);
            });
            setStockLevels(stockMap);

            if (selectedBatch) {
                const updated = res.data.find(b => getEntityId(b) === getEntityId(selectedBatch));
                if (updated) setSelectedBatch(updated);
                else setSelectedBatch(null);
            }
        } catch (err) {
            notifyError('Failed to load store requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleDispatch = async () => {
        if (!selectedBatch) return;
        const hasDispatchableLines = (selectedBatch.lines || []).some((line) => getDispatchableQty(line) > 0);
        if (!hasDispatchableLines) {
            notifyError('No confirmed line with pending quantity is available for dispatch.');
            return;
        }
        try {
            setProcessing(true);
            await inventoryService.dispatchStoreRequest({
                batchId: getEntityId(selectedBatch),
                storeRemarks: remarks
            });
            notifySuccess(`Batch ${selectedBatch.batchNumber} dispatched successfully.`);
            setRemarks('');
            setSelectedBatch(null);
            fetchRequests();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Dispatch failed');
        } finally {
            setProcessing(false);
        }
    };

    const handleConfirmAllAvailable = async () => {
        if (!selectedBatch) return;
        try {
            setProcessing(true);
            const lineIds = (selectedBatch.lines || []).map((line) => getEntityId(line)).filter(Boolean);
            await inventoryService.confirmStoreRequest({
                batchId: getEntityId(selectedBatch),
                lineIds,
                confirmedIdsArray: [], // Sending empty to fall back to actualQuantities for manual control
                actualQuantities: lineQuantities,
                reasons: lineRemarks
            });
            notifySuccess('Stock availability confirmed. Any unfulfilled quantity has been synchronized to Purchase.');
            fetchRequests();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Confirmation failed');
        } finally {
            setProcessing(false);
        }
    };

    const handleApproveShortage = async () => {
        if (!selectedBatch) return;
        try {
            setProcessing(true);
            await inventoryService.approveStoreShortage({
                batchId: getEntityId(selectedBatch),
                adminRemarks
            });
            notifySuccess('Discrepancy reviewed. Purchase queue synchronized.');
            setAdminRemarks('');
            fetchRequests();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Shortage approval failed');
        } finally {
            setProcessing(false);
        }
    };

    // Accent: amber
    const accentIcon = "text-amber-500";
    const accentBg = "bg-amber-500/10";
    const accentBorder = "border-amber-500/30";

    return (
        <Layout currentPage="store-requests">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-[#556070] tracking-tight mb-2">Store Requests</h1>
                        <p className="text-text-secondary">Fulfill and dispatch material requests from stock or inwarded goods.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* List Column */}
                        <div className="lg:col-span-1 space-y-4 h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
                            {loading ? (
                                [1, 2, 3].map(i => (
                                    <div key={i} className="h-24 bg-surface-dark border border-border-dark rounded-xl animate-pulse"></div>
                                ))
                            ) : batches.length === 0 ? (
                                <div className="p-12 text-center bg-surface-dark/30 border border-border-dark border-dashed rounded-xl">
                                    <span className="material-symbols-outlined text-4xl text-text-secondary/30 mb-4">inbox</span>
                                    <p className="text-text-secondary font-medium">No pending requests</p>
                                </div>
                            ) : (
                                batches.map(batch => (
                                    <button
                                        key={getEntityId(batch)}
                                        onClick={() => setSelectedBatch(batch)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${getEntityId(selectedBatch) === getEntityId(batch)
                                            ? 'bg-amber-500/5 border-amber-500 ring-1 ring-amber-500/30'
                                            : 'bg-surface-dark border-border-dark hover:border-text-secondary/30'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-amber-400 font-bold text-sm tracking-tight">{batch.batchNumber}</span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase ${batch.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-500'
                                                }`}>
                                                {batch.status}
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[#556070] text-xs font-semibold">{batch.materialRequestId?.project?.name}</div>
                                            <div className="text-text-secondary text-[10px] uppercase font-bold">{batch.materialRequestId?.requestNumber}</div>
                                        </div>
                                        <div className="mt-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-xs text-text-secondary">category</span>
                                            <span className="text-xs text-text-secondary">{batch.lines?.length || 0} items</span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Detail Column */}
                        <div className="lg:col-span-2">
                            {selectedBatch ? (
                                <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-right-4">
                                    <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-amber-500/5 to-transparent">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-xl font-bold text-[#556070] mb-1">{selectedBatch.batchNumber}</h3>
                                                <p className="text-text-secondary text-sm">
                                                    Source: {selectedBatch.notes?.includes('AUTO') ? 'Purchase Inward' : 'Direct Stock'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[#556070] text-sm font-bold">{selectedBatch.materialRequestId?.project?.name}</div>
                                                <div className="text-text-secondary text-xs uppercase tracking-widest font-black">{selectedBatch.materialRequestId?.requestNumber}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6">
                                        <div className="mb-6 grid grid-cols-3 gap-4">
                                            <div className="bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-4">
                                                <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">Batch Status</div>
                                                <div className="text-[#556070] font-bold">{selectedBatch.status}</div>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-4">
                                                <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">Pending Lines</div>
                                                <div className="text-[#556070] font-bold">
                                                    {selectedBatch.lines.filter((line) => line.status === 'PENDING').length}
                                                </div>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-4">
                                                <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">Confirmed Lines</div>
                                                <div className="text-[#556070] font-bold">
                                                    {selectedBatch.lines.filter((line) => line.status === 'CONFIRMED').length}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4 mb-8">
                                            <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-4">Requested Items</h4>
                                            <div className="bg-background-dark/50 rounded-xl border border-border-dark overflow-hidden overflow-x-auto">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-border-dark text-[10px] font-black text-text-secondary uppercase tracking-widest bg-surface-dark/50">
                                                            <th className="p-4 font-bold">Component Name</th>
                                                            <th className="p-4 text-center font-bold">Actual Req Qty</th>
                                                            <th className="p-4 text-center font-bold">Current Stock</th>
                                                            <th className="p-4 text-center font-bold">Availability</th>
                                                            <th className="p-4 font-bold">Remark</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border-dark">
                                                        {selectedBatch.lines.map((line) => {
                                                            const lineId = getEntityId(line);
                                                            const isEditable = !isAdmin && ['PENDING', 'SHORTAGE_REPORTED'].includes(selectedBatch.status);
                                                            return (
                                                                <tr key={lineId} className="group hover:bg-white/5 transition-colors">
                                                                    <td className="p-4">
                                                                        <div className="text-slate-700 text-sm font-bold">{line.itemId?.name}</div>
                                                                        <div className="text-amber-500/70 text-[10px] font-mono">{line.itemId?.itemCode}</div>
                                                                        <div className={`text-[10px] font-black uppercase mt-1 ${line.status === 'CONFIRMED'
                                                                                ? 'text-emerald-400'
                                                                                : line.status === 'SHORTAGE_REPORTED'
                                                                                    ? 'text-red-400'
                                                                                    : 'text-amber-400'
                                                                            }`}>
                                                                            {line.status.replace(/_/g, ' ')}
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-4 text-center">
                                                                        <div className="text-slate-700 font-bold">{line.requestedQuantity}</div>
                                                                        <div className="text-[10px] text-text-secondary uppercase">{line.itemId?.uom}</div>
                                                                    </td>
                                                                    <td className="p-4 text-center">
                                                                        <div className="text-slate-700 font-bold">{stockLevels[getEntityId(line.itemId)] || 0}</div>
                                                                        <div className="text-[10px] text-text-secondary uppercase">{line.itemId?.uom}</div>
                                                                    </td>
                                                                    <td className="p-4 text-center">
                                                                        {isEditable ? (
                                                                            <input
                                                                                type="number"
                                                                                className="w-24 bg-slate-50 border border-slate-200 rounded p-2 text-slate-700 text-center text-sm focus:ring-1 focus:ring-amber-500 outline-none transition-all mx-auto block"
                                                                                value={lineQuantities[lineId] ?? ''}
                                                                                onChange={(e) => setLineQuantities(prev => ({ ...prev, [lineId]: e.target.value }))}
                                                                                min="0"
                                                                                max={line.requestedQuantity}
                                                                            />
                                                                        ) : (
                                                                            <div className="text-slate-700 font-bold text-lg">
                                                                                {['CONFIRMED', 'SHORTAGE_REPORTED', 'SHORTAGE_APPROVED'].includes(line.status)
                                                                                    ? line.confirmedQuantity
                                                                                    : line.requestedQuantity}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-4">
                                                                        {isEditable ? (
                                                                            <input
                                                                                type="text"
                                                                                className="w-full min-w-[150px] bg-slate-50 border border-slate-200 rounded p-2 text-slate-700 text-sm focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                                                                                placeholder="Add remark..."
                                                                                value={lineRemarks[lineId] ?? ''}
                                                                                onChange={(e) => setLineRemarks(prev => ({ ...prev, [lineId]: e.target.value }))}
                                                                            />
                                                                        ) : (
                                                                            <div className="text-text-secondary text-sm">
                                                                                {line.shortageReason || '-'}
                                                                                <div className="text-[10px] uppercase tracking-widest mt-1">
                                                                                    Source: {line.source === 'PURCHASE_INWARD' ? 'Purchase Inward' : 'Direct Stock'}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div className="space-y-4 pt-6 border-t border-border-dark">
                                            {!isAdmin && ['PENDING', 'SHORTAGE_REPORTED'].includes(selectedBatch.status) && (
                                                <button
                                                    onClick={handleConfirmAllAvailable}
                                                    disabled={processing}
                                                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black uppercase tracking-[0.1em] py-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                                                >
                                                    <span className="material-symbols-outlined font-bold">inventory</span>
                                                    {processing ? 'Confirming...' : selectedBatch.status === 'SHORTAGE_REPORTED' ? 'Reconfirm Available Stock' : 'Confirm Available Stock'}
                                                </button>
                                            )}

                                            {isAdmin && selectedBatch.status === 'SHORTAGE_REPORTED' && (
                                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 mt-6">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <span className="material-symbols-outlined text-red-400">warning</span>
                                                        <h3 className="text-red-400 font-bold uppercase tracking-widest text-sm">Admin Shortage Approval</h3>
                                                    </div>
                                                    <p className="text-text-secondary text-xs mb-4">
                                                        This batch has a reported stock discrepancy. Review the remarks and approve the discrepancy record. Purchase demand is synchronized separately from store confirmation.
                                                    </p>
                                                    <textarea
                                                        className="w-full bg-surface-dark border border-border-dark rounded-xl p-3 text-white text-sm outline-none focus:ring-1 focus:ring-red-500 h-20 transition-all mb-4"
                                                        placeholder="Add admin remarks..."
                                                        value={adminRemarks}
                                                        onChange={(e) => setAdminRemarks(e.target.value)}
                                                    ></textarea>
                                                    <button
                                                        onClick={handleApproveShortage}
                                                        disabled={processing}
                                                        className="w-full bg-red-500 hover:bg-red-400 disabled:opacity-50 text-black font-black uppercase tracking-[0.1em] py-3 rounded-xl transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined font-bold">verified</span>
                                                        {processing ? 'Processing...' : 'Approve Discrepancy Review'}
                                                    </button>
                                                </div>
                                            )}

                                            <div>
                                                <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">Dispatch Remarks</label>
                                                <textarea
                                                    className="w-full bg-slate-100 border border-slate-200 shadow-sm rounded-xl p-4 text-[#556070] text-sm outline-none focus:ring-1 focus:ring-amber-500 h-24 transition-all"
                                                    placeholder="Add any loading or delivery instructions..."
                                                    value={remarks}
                                                    onChange={(e) => setRemarks(e.target.value)}
                                                ></textarea>
                                            </div>

                                            <div className="flex gap-4">
                                                <button
                                                    onClick={handleDispatch}
                                                    disabled={processing || !(selectedBatch.lines || []).some((line) => getDispatchableQty(line) > 0)}
                                                    className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black uppercase tracking-[0.1em] py-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                                                >
                                                    <span className="material-symbols-outlined font-bold">local_shipping</span>
                                                    {processing ? 'Processing...' : 'Confirm Dispatch'}
                                                </button>
                                            </div>
                                            {!((selectedBatch.lines || []).some((line) => getDispatchableQty(line) > 0)) && (
                                                <p className="text-center text-amber-500/70 text-[10px] font-bold uppercase tracking-widest">
                                                    Waiting for confirmed pending quantity (or inward completion)
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-[400px] flex flex-col items-center justify-center bg-white/30 border border-dashed border-slate-200 shadow-sm rounded-2xl">
                                    <div className="size-16 rounded-full bg-surface-dark flex items-center justify-center mb-4">
                                        <span className="material-symbols-outlined text-text-secondary text-3xl">assignment_turned_in</span>
                                    </div>
                                    <p className="text-text-secondary font-medium tracking-wide">Select a batch to process for dispatch</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
