import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';

export default function InventoryAudit({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const currentPage = propCurrentPage || 'store-reports';
    const [history, setHistory] = useState([]);
    const [lowStock, setLowStock] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [histRes, lowRes] = await Promise.all([
                inventoryService.getStockLedger(),
                inventoryService.getLowStockReport()
            ]);
            setHistory(histRes.data);
            setLowStock(lowRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-[#556070] tracking-tight">Audit & Intelligence</h1>
                        <p className="text-text-secondary">Historical ledger and predictive inventory reports.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Stock History Ledger */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden shadow-2xl">
                                <div className="bg-slate-50 flex justify-between items-center px-6 py-5 border-b border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                                            <span className="material-symbols-outlined">history_edu</span>
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold text-white leading-none">Stock Ledger</h2>
                                            <p className="text-text-secondary text-[11px] font-medium mt-1 uppercase tracking-wider">Transaction Audit Trail</p>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-lg opacity-40">search</span>
                                        <input 
                                            type="text" 
                                            placeholder="Search ledger..." 
                                            className="bg-slate-100 border border-slate-200 shadow-sm rounded-lg pl-10 pr-4 py-2 text-xs text-[#556070] focus:ring-1 focus:ring-amber-500 outline-none transition-all w-64"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>
                                {loading ? (
                                    <div className="p-20 text-center">
                                        <div className="animate-spin size-10 border-4 border-amber-500 border-t-transparent rounded-full mx-auto shadow-lg shadow-amber-500/20"></div>
                                        <p className="text-text-secondary mt-4 font-medium">Loading ledger data...</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto max-h-[700px] overflow-y-auto custom-scrollbar">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-50 sticky top-0 z-10 backdrop-blur-md border-b border-slate-200 shadow-sm">
                                                <tr>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Timestamp</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Item Details</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Location</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Type</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary text-right">Qty Change</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {history.map((log, idx) => (
                                                    <tr key={idx} className="hover:bg-amber-500/[0.02] transition-colors group">
                                                        <td className="px-6 py-4">
                                                            <div className="text-white text-xs font-bold">{new Date(log.createdAt).toLocaleDateString()}</div>
                                                            <div className="text-text-secondary text-[10px] font-medium opacity-60">{new Date(log.createdAt).toLocaleTimeString()}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-white font-bold group-hover:text-amber-500 transition-colors">{log.itemId?.name || log.item?.name}</div>
                                                            <div className="text-amber-500/70 text-[10px] font-mono font-black">{log.itemId?.itemCode || log.item?.itemCode}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="material-symbols-outlined text-sm text-text-secondary">location_on</span>
                                                                <span className="text-text-secondary text-xs font-medium">{log.locationId?.name || 'Main Warehouse'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                                                log.movementType === 'INWARD' || log.movementType === 'STOCK_ADDITION' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                log.movementType === 'DISPATCH' || log.movementType === 'STOCK_REDUCTION' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                            }`}>
                                                                {log.movementType?.replace(/_/g, ' ') || 'TRANSACTION'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className={`text-base font-black ${log.quantityChange > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                {log.quantityChange > 0 ? '+' : ''}{log.quantityChange}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {history.length === 0 && (
                                                    <tr>
                                                        <td colSpan="5" className="px-6 py-32 text-center text-text-secondary italic">
                                                            No transaction history found in the ledger.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Intelligence Sidebar */}
                        <div className="space-y-6">
                            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <span className="material-symbols-outlined text-6xl text-amber-500">warning</span>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-4">Critical Low Stock</h3>
                                <div className="space-y-4">
                                    {lowStock.length === 0 ? (
                                        <p className="text-text-secondary text-sm">All inventory levels are healthy.</p>
                                    ) : (
                                        lowStock.map(item => (
                                            <div key={item.id} className="bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-3 hover:bg-slate-100 transition-all">
                                                <div>
                                                    <div className="text-white text-sm font-bold truncate max-w-[120px]">{item.name}</div>
                                                    <div className="text-primary text-[10px] font-mono">{item.itemCode}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-amber-500 font-black">{item.quantityOnHand}</div>
                                                    <div className="text-[9px] text-text-secondary uppercase">Left</div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
