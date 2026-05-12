import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

const getEntityId = (value) => value?.id || value?._id || '';

export default function StoreRequestsPage() {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const [batches, setBatches] = useState([]);
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [remarks, setRemarks] = useState('');

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const res = await inventoryService.getStoreRequests();
            setBatches(res.data);
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
                confirmedIdsArray: lineIds
            });
            notifySuccess('Stock availability confirmed.');
            fetchRequests();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Confirmation failed');
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
                        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Store Requests</h1>
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
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase ${
                                                batch.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-500'
                                            }`}>
                                                {batch.status}
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-white text-xs font-semibold">{batch.materialRequestId?.project?.name}</div>
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
                                <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-right-4">
                                    <div className="p-6 border-b border-border-dark bg-gradient-to-r from-amber-500/5 to-transparent">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-xl font-bold text-white mb-1">{selectedBatch.batchNumber}</h3>
                                                <p className="text-text-secondary text-sm">
                                                    Source: {selectedBatch.notes?.includes('AUTO') ? 'Purchase Inward' : 'Direct Stock'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-white text-sm font-bold">{selectedBatch.materialRequestId?.project?.name}</div>
                                                <div className="text-text-secondary text-xs uppercase tracking-widest font-black">{selectedBatch.materialRequestId?.requestNumber}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6">
                                        <div className="mb-6 grid grid-cols-3 gap-4">
                                            <div className="bg-background-dark/50 border border-border-dark rounded-xl p-4">
                                                <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">Batch Status</div>
                                                <div className="text-white font-bold">{selectedBatch.status}</div>
                                            </div>
                                            <div className="bg-background-dark/50 border border-border-dark rounded-xl p-4">
                                                <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">Pending Lines</div>
                                                <div className="text-white font-bold">
                                                    {selectedBatch.lines.filter((line) => line.status === 'PENDING').length}
                                                </div>
                                            </div>
                                            <div className="bg-background-dark/50 border border-border-dark rounded-xl p-4">
                                                <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">Confirmed Lines</div>
                                                <div className="text-white font-bold">
                                                    {selectedBatch.lines.filter((line) => line.status === 'CONFIRMED').length}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4 mb-8">
                                            <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-4">Requested Items</h4>
                                            <div className="divide-y divide-border-dark bg-background-dark/50 rounded-xl border border-border-dark overflow-hidden">
                                                {selectedBatch.lines.map((line) => (
                                                    <div key={getEntityId(line)} className="p-4 flex justify-between items-center group hover:bg-white/5 transition-colors">
                                                        <div className="flex gap-4">
                                                            <div className="size-10 rounded-lg bg-surface-dark flex items-center justify-center border border-border-dark">
                                                                <span className="material-symbols-outlined text-text-secondary text-sm">inventory_2</span>
                                                            </div>
                                                            <div>
                                                                <div className="text-white text-sm font-bold">{line.itemId?.name}</div>
                                                                <div className="text-amber-500/70 text-[10px] font-mono">{line.itemId?.itemCode}</div>
                                                                <div className="text-text-secondary text-[10px] uppercase mt-1">
                                                                    Source: {line.source === 'PURCHASE_INWARD' ? 'Purchase inward' : 'Store stock'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-lg text-white font-black">
                                                                {(line.status === 'CONFIRMED' ? line.confirmedQuantity : line.pendingQuantity || line.requestedQuantity || 0)} <span className="text-[10px] text-text-secondary font-medium uppercase">{line.itemId?.uom}</span>
                                                            </div>
                                                            <div className="text-[10px] text-text-secondary uppercase">Requested: {line.requestedQuantity}</div>
                                                            <div className={`text-[10px] font-black uppercase mt-1 ${
                                                                line.status === 'CONFIRMED'
                                                                    ? 'text-emerald-400'
                                                                    : line.status === 'SHORTAGE_REPORTED'
                                                                        ? 'text-red-400'
                                                                        : 'text-amber-400'
                                                            }`}>
                                                                {line.status.replace(/_/g, ' ')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4 pt-6 border-t border-border-dark">
                                            {['PENDING', 'SHORTAGE_REPORTED'].includes(selectedBatch.status) && (
                                                <button
                                                    onClick={handleConfirmAllAvailable}
                                                    disabled={processing}
                                                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black uppercase tracking-[0.1em] py-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                                                >
                                                    <span className="material-symbols-outlined font-bold">inventory</span>
                                                    {processing ? 'Confirming...' : selectedBatch.status === 'SHORTAGE_REPORTED' ? 'Reconfirm Available Stock' : 'Confirm Available Stock'}
                                                </button>
                                            )}
                                            <div>
                                                <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">Dispatch Remarks</label>
                                                <textarea
                                                    className="w-full bg-background-dark border border-border-dark rounded-xl p-4 text-white text-sm outline-none focus:ring-1 focus:ring-amber-500 h-24 transition-all"
                                                    placeholder="Add any loading or delivery instructions..."
                                                    value={remarks}
                                                    onChange={(e) => setRemarks(e.target.value)}
                                                ></textarea>
                                            </div>

                                            <div className="flex gap-4">
                                                <button
                                                    onClick={handleDispatch}
                                                    disabled={processing || selectedBatch.status !== 'CONFIRMED'}
                                                    className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black uppercase tracking-[0.1em] py-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                                                >
                                                    <span className="material-symbols-outlined font-bold">local_shipping</span>
                                                    {processing ? 'Processing...' : 'Confirm Dispatch'}
                                                </button>
                                            </div>
                                            {selectedBatch.status !== 'CONFIRMED' && (
                                                <p className="text-center text-amber-500/70 text-[10px] font-bold uppercase tracking-widest">
                                                    Waiting for availability confirmation or inward completion
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-[400px] flex flex-col items-center justify-center bg-surface-dark/30 border border-dashed border-border-dark rounded-2xl">
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
