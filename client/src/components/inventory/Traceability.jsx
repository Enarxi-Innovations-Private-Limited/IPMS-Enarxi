import { useState } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout';

export default function Traceability() {
    const Layout = usePortalLayout();
    const [serial, setSerial] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        if (!serial) return;
        try {
            setLoading(true);
            // This is a specialized search. We'll use the history API but filter for serials
            // In a real system, we'd have a dedicated /stock/serial/:id route.
            // For now, we'll implement a mock or assume a specific route.
            const res = await inventoryService.getStockHistory(`?serial=${serial}`);
            setResult(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout currentPage="inv-traceability">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-4xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Global Traceability</h1>
                        <p className="text-text-secondary">Track the lifecycle of a specific hardware asset by Serial Number.</p>
                    </div>

                    <div className="bg-surface-dark border border-border-dark rounded-3xl p-8 mb-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <span className="material-symbols-outlined text-9xl text-primary">qr_code_scanner</span>
                        </div>
                        
                        <div className="relative z-10">
                            <label className="block text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-3">Asset Serial Number</label>
                            <div className="flex gap-4">
                                <input 
                                    type="text" 
                                    placeholder="e.g. SN-2024-X9902"
                                    className="flex-1 bg-background-dark border border-border-dark rounded-2xl px-6 py-4 text-white text-lg font-mono outline-none focus:ring-2 focus:ring-primary shadow-inner"
                                    value={serial}
                                    onChange={(e) => setSerial(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                />
                                <button 
                                    onClick={handleSearch}
                                    disabled={loading}
                                    className="px-8 bg-primary text-white font-black uppercase tracking-widest rounded-2xl hover:bg-primary-hover transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                                >
                                    {loading ? 'Scanning...' : 'Track Asset'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                         <div className="space-y-4">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="h-24 bg-surface-dark/50 border border-border-dark rounded-2xl animate-pulse"></div>
                            ))}
                         </div>
                    ) : result ? (
                        <div className="space-y-6">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Asset Journey</h3>
                            <div className="relative border-l-2 border-border-dark ml-4 pl-8 space-y-8">
                                {result.length === 0 ? (
                                    <div className="text-text-secondary italic">No records found for this serial number.</div>
                                ) : (
                                    result.map((log, i) => (
                                        <div key={i} className="relative">
                                            <div className="absolute -left-[41px] top-0 size-4 rounded-full bg-primary ring-4 ring-background-dark"></div>
                                            <div className="bg-surface-dark border border-border-dark rounded-2xl p-5 shadow-xl">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="text-white font-bold">{log.movementType?.replace(/_/g, ' ')}</div>
                                                    <div className="text-[10px] text-text-secondary font-bold uppercase">{new Date(log.createdAt).toLocaleString()}</div>
                                                </div>
                                                <p className="text-text-secondary text-sm mb-3">{log.remarks}</p>
                                                <div className="flex gap-4">
                                                    <div className="px-2 py-1 bg-background-dark rounded border border-border-dark text-[9px] text-primary font-bold uppercase tracking-wider">
                                                        Loc: {log.locationId?.name || 'In Transit'}
                                                    </div>
                                                    <div className="px-2 py-1 bg-background-dark rounded border border-border-dark text-[9px] text-text-secondary font-bold uppercase tracking-wider">
                                                        User: {log.createdById?.name}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="py-20 text-center text-text-secondary">
                             <span className="material-symbols-outlined text-6xl opacity-20 mb-4">search_check</span>
                             <p>Enter a serial number above to visualize the asset's history.</p>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
