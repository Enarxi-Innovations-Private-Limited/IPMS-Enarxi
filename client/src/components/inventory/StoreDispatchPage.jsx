import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

export default function StoreDispatchPage({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const { error: notifyError, success: notifySuccess } = useNotifier();
    const currentPage = propCurrentPage || 'store-dispatches';
    const [dispatches, setDispatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedDispatch, setSelectedDispatch] = useState(null);
    const [acknowledging, setAcknowledging] = useState(false);
    const [remarks, setRemarks] = useState('');

    const fetchDispatches = async () => {
        try {
            setLoading(true);
            const res = await inventoryService.getDispatches();
            setDispatches(res.data);
        } catch (err) {
            setError('Failed to load dispatch records.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDispatches();
    }, []);

    const handleAcknowledge = async (dispatchId) => {
        try {
            setAcknowledging(true);
            await inventoryService.confirmDispatch(dispatchId, remarks);
            notifySuccess('Receipt acknowledged successfully.');
            setRemarks('');
            setSelectedDispatch(null);
            fetchDispatches();
        } catch (err) {
            notifyError(err.response?.data?.message || 'Acknowledgment failed');
        } finally {
            setAcknowledging(false);
        }
    };

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl md:text-4xl font-bold text-[#556070] tracking-tight mb-2">
                            Stock Dispatches
                        </h1>
                        <p className="text-text-secondary text-lg">
                            Track and verify material movements to your project site.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* List Section */}
                        <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-250px)] pr-2 custom-scrollbar">
                            {loading ? (
                                <div className="p-20 text-center bg-white rounded-xl border border-slate-200 animate-pulse">
                                    <div className="size-8 bg-slate-200 rounded-full mx-auto mb-4"></div>
                                </div>
                            ) : dispatches.length === 0 ? (
                                <div className="p-20 text-center bg-white rounded-xl border border-slate-200 border-dashed">
                                    <span className="material-symbols-outlined text-text-secondary text-5xl mb-4">local_shipping</span>
                                    <p className="text-text-secondary font-medium">No pending dispatches found.</p>
                                </div>
                            ) : (
                                dispatches.map((dispatch) => (
                                    <button
                                        key={dispatch.id}
                                        onClick={() => setSelectedDispatch(dispatch)}
                                        className={`w-full text-left bg-white border rounded-xl overflow-hidden shadow-lg transition-all ${selectedDispatch?.id === dispatch.id ? 'border-primary ring-1 ring-primary/30 bg-primary/5' : 'border-slate-200 hover:border-text-secondary/30'
                                            }`}
                                    >
                                        <div className="p-5">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex gap-3">
                                                    <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined text-primary text-sm font-bold">package_2</span>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-[#556070] font-bold">{dispatch.dispatchNumber}</h3>
                                                        <p className="text-text-secondary text-[10px] uppercase font-black tracking-widest">{new Date(dispatch.dispatchedAt).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest uppercase ${dispatch.status === 'DISPATCHED' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-400'
                                                    }`}>
                                                    {dispatch.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-text-secondary uppercase">Project:</span>
                                                <span className="text-[#556070] text-xs font-semibold truncate">{dispatch.storeRequest?.materialRequest?.project?.name}</span>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Detail / Action Section */}
                        <div className="lg:col-span-1">
                            {selectedDispatch ? (
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                                    <div className="p-6 border-b border-slate-200 bg-[#ECF1FF]/40">
                                        <h3 className="text-xl font-bold text-[#556070] mb-1">Verify Shipment</h3>
                                        <p className="text-text-secondary text-sm">Please inspect the items listed below before acknowledging receipt.</p>
                                    </div>
                                    <div className="p-6 space-y-6">
                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em]">Package Contents</h4>
                                            <div className="divide-y divide-slate-200">
                                                {selectedDispatch.lines?.map((line, idx) => (
                                                    <div key={idx} className="py-3 flex justify-between items-center">
                                                        <div>
                                                            <div className="text-[#556070] text-sm font-bold">{line.itemId?.name}</div>
                                                            <div className="text-primary text-[10px] font-mono">{line.itemId?.itemCode}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[#556070] font-black">{line.dispatchedQuantity}</div>
                                                            <div className="text-[10px] text-text-secondary uppercase">{line.itemId?.uom}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {selectedDispatch.status === 'DISPATCHED' ? (
                                            <div className="space-y-4 pt-4 border-t border-slate-200">
                                                <div>
                                                    <label className="block text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">Acknowledgment Remarks</label>
                                                    <textarea
                                                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-[#556070] text-sm outline-none focus:ring-1 focus:ring-primary h-24"
                                                        placeholder="e.g. Received in good condition..."
                                                        value={remarks}
                                                        onChange={(e) => setRemarks(e.target.value)}
                                                    ></textarea>
                                                </div>
                                                <button
                                                    onClick={() => handleAcknowledge(selectedDispatch.id)}
                                                    disabled={acknowledging}
                                                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                                                >
                                                    {acknowledging ? 'Syncing...' : 'Acknowledge Receipt'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1">
                                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                                    Received & Verified
                                                </div>
                                                <p className="text-text-secondary text-xs italic">"{selectedDispatch.engineerRemarks || 'No remarks provided'}"</p>
                                                <div className="mt-3 text-[10px] text-emerald-400/70 font-medium">
                                                    Acknowledged on {new Date(selectedDispatch.acknowledgedAt).toLocaleString()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-[400px] flex flex-col items-center justify-center bg-white/30 border border-dashed border-slate-200 rounded-2xl">
                                    <span className="material-symbols-outlined text-slate-400 text-6xl mb-4">move_to_inbox</span>
                                    <p className="text-text-secondary font-medium tracking-wide">Select a dispatch from the queue to verify</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
