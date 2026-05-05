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
                inventoryService.getStockHistory(),
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
                        <h1 className="text-3xl font-bold text-white tracking-tight">Audit & Intelligence</h1>
                        <p className="text-text-secondary">Historical ledger and predictive inventory reports.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Stock History Ledger */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-xl">
                                <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex justify-between items-center">
                                    <h2 className="text-lg font-bold text-white">Stock Ledger</h2>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            placeholder="Search ledger..." 
                                            className="bg-background-dark border border-border-dark rounded-lg px-3 py-1 text-xs text-white"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>
                                {loading ? (
                                    <div className="p-20 text-center">
                                        <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-background-dark/50 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase text-text-secondary">Date</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase text-text-secondary">Component</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase text-text-secondary">Action</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase text-text-secondary text-right">Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark text-sm">
                                                {history.map((log, idx) => (
                                                    <tr key={idx} className="hover:bg-primary/5">
                                                        <td className="px-6 py-4 text-text-secondary text-xs">
                                                            {new Date(log.createdAt).toLocaleString()}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-white font-medium">{log.item?.name}</div>
                                                            <div className="text-primary text-[10px]">{log.item?.itemCode}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                log.type === 'INWARD' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                log.type === 'OUTWARD' ? 'bg-red-500/20 text-red-400' :
                                                                'bg-blue-500/20 text-blue-400'
                                                            }`}>
                                                                {log.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className={`font-bold ${log.quantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                {log.quantity > 0 ? '+' : ''}{log.quantity}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Intelligence Sidebar */}
                        <div className="space-y-6">
                            <div className="bg-surface-dark border border-border-dark rounded-2xl p-6 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <span className="material-symbols-outlined text-6xl text-amber-500">warning</span>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-4">Critical Low Stock</h3>
                                <div className="space-y-4">
                                    {lowStock.length === 0 ? (
                                        <p className="text-text-secondary text-sm">All inventory levels are healthy.</p>
                                    ) : (
                                        lowStock.map(item => (
                                            <div key={item.id} className="flex justify-between items-center p-3 bg-background-dark/50 rounded-xl border border-border-dark">
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

                            <div className="bg-gradient-to-br from-primary/20 to-surface-dark border border-primary/20 rounded-2xl p-6 shadow-xl">
                                <h3 className="text-white font-bold mb-2">Export Data</h3>
                                <p className="text-text-secondary text-sm mb-4">Generate full audit reports for financial reconciliation.</p>
                                <button className="w-full bg-primary text-white py-2 rounded-lg font-bold text-sm shadow-lg shadow-primary/20">
                                    Download CSV Report
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
