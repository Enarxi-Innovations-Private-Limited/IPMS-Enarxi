import { useState, useEffect } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';

export default function StockOverview({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const currentPage = propCurrentPage || 'purchase-stock'; // Fallback for purchase manager or direct access
    const [stock, setStock] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [itemHistory, setItemHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        if (selectedItem) {
            fetchItemHistory(selectedItem._id || selectedItem.id);
        }
    }, [selectedItem]);

    const fetchItemHistory = async (itemId) => {
        try {
            setHistoryLoading(true);
            const res = await inventoryService.getStockHistory(itemId);
            setItemHistory(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        const fetchStock = async () => {
            try {
                setLoading(true);
                const res = await inventoryService.getCurrentStock();
                // Filter only hardware items if needed, or assume all currently mapped are hardware
                setStock(res.data);
            } catch (err) {
                setError('Failed to fetch stock data. Please ensure the inventory service is running.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchStock();
    }, []);

    const filteredStock = stock.filter(item =>
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalItems = stock.length;
    const lowStockCount = stock.filter(item => item.quantityOnHand < 5).length; // Example threshold

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
                                Hardware Stock Inventory
                            </h1>
                            <p className="text-text-secondary text-lg">
                                Real-time visibility into components and hardware assets.
                            </p>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 blur-3xl -mr-12 -mt-12 transition-all group-hover:bg-primary/20"></div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Total SKUs</h3>
                                <span className="material-symbols-outlined text-primary">inventory_2</span>
                            </div>
                            <p className="text-3xl font-bold text-white">{totalItems}</p>
                            <p className="text-text-secondary text-sm mt-1">Unique hardware items</p>
                        </div>

                        <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-3xl -mr-12 -mt-12 transition-all group-hover:bg-amber-500/20"></div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Low Stock</h3>
                                <span className="material-symbols-outlined text-amber-500">warning</span>
                            </div>
                            <p className="text-3xl font-bold text-white">{lowStockCount}</p>
                            <p className="text-text-secondary text-sm mt-1">Items below threshold</p>
                        </div>

                        <div className="bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 blur-3xl -mr-12 -mt-12 transition-all group-hover:bg-emerald-500/20"></div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-text-secondary text-sm font-medium uppercase tracking-wider">Storage Locations</h3>
                                <span className="material-symbols-outlined text-emerald-500">location_on</span>
                            </div>
                            <p className="text-3xl font-bold text-white">4</p>
                            <p className="text-text-secondary text-sm mt-1">Active warehouses</p>
                        </div>
                    </div>

                    {/* Table Section */}
                    <div className="bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-gradient-surface flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">list_alt</span>
                                Current Availability
                            </h2>
                            <div className="relative w-full md:w-80">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-xl">search</span>
                                <input
                                    type="text"
                                    placeholder="Search by name or code..."
                                    className="w-full bg-background-dark border border-border-dark rounded-lg py-2 pl-10 pr-4 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-primary outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-20 text-center">
                                <div className="animate-spin size-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                                <p className="text-text-secondary">Syncing with inventory service...</p>
                            </div>
                        ) : error ? (
                            <div className="p-20 text-center">
                                <span className="material-symbols-outlined text-red-500 text-5xl mb-4">error</span>
                                <p className="text-white font-medium">{error}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-background-dark/50">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-text-secondary">Item Details</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-text-secondary">Category</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-text-secondary">Quantity</th>
                                            <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-text-secondary">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark">
                                        {filteredStock.map((item) => (
                                            <tr
                                                key={item.id || item._id}
                                                onClick={() => setSelectedItem(item)}
                                                className="hover:bg-primary/5 transition-colors cursor-pointer group"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="text-white font-medium group-hover:text-primary transition-colors">{item.name}</div>
                                                    <div className="text-text-secondary text-sm mt-0.5 font-mono">{item.itemCode}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest bg-surface-dark border border-border-dark px-2 py-1 rounded">
                                                        {item.classification?.name || 'Hardware'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-mono">
                                                    <span className={`text-lg font-bold ${item.quantityOnHand < 5 ? 'text-amber-400' : 'text-white'}`}>
                                                        {item.quantityOnHand}
                                                    </span>
                                                    <span className="text-text-secondary text-[10px] uppercase font-bold ml-1">{item.uom || 'Nos'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {item.quantityOnHand > 10 ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase border border-emerald-500/20">
                                                            In Stock
                                                        </span>
                                                    ) : item.quantityOnHand > 0 ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase border border-amber-500/20">
                                                            Low Stock
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 text-[10px] font-black uppercase border border-red-500/20">
                                                            Out of Stock
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredStock.length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="px-6 py-20 text-center text-text-secondary">
                                                    No hardware components found matching your search.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Item Detail Modal */}
            {selectedItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm" onClick={() => setSelectedItem(null)}></div>
                    <div className="relative bg-surface-dark border border-border-dark w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col md:flex-row h-full max-h-[85vh]">
                            {/* Info Side */}
                            <div className="w-full md:w-1/3 p-8 border-r border-border-dark bg-gradient-surface">
                                <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6">
                                    <span className="material-symbols-outlined text-3xl font-bold">memory</span>
                                </div>
                                <h3 className="text-2xl font-black text-white leading-tight mb-2">{selectedItem.name}</h3>
                                <div className="text-primary font-mono text-sm mb-6">{selectedItem.itemCode}</div>

                                <div className="space-y-6">
                                    <div>
                                        <div className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-1">Available Quantity</div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-4xl font-black text-white">{selectedItem.quantityOnHand}</span>
                                            <span className="text-text-secondary font-bold uppercase text-xs">{selectedItem.uom}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-1">Classification</div>
                                        <div className="text-white font-bold">{selectedItem.classification?.name}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Ledger Side */}
                            <div className="w-full md:w-2/3 p-8 overflow-y-auto custom-scrollbar">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Movement Ledger</h4>
                                    <button onClick={() => setSelectedItem(null)} className="text-text-secondary hover:text-white">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>

                                {historyLoading ? (
                                    <div className="space-y-4">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className="h-12 bg-background-dark/50 rounded-xl animate-pulse"></div>
                                        ))}
                                    </div>
                                ) : itemHistory.length === 0 ? (
                                    <div className="py-20 text-center">
                                        <p className="text-text-secondary italic">No movement records found for this component.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {itemHistory.map((log, idx) => (
                                            <div key={idx} className="p-4 bg-background-dark/30 border border-border-dark/50 rounded-2xl flex justify-between items-center group hover:border-primary/30 transition-all">
                                                <div className="flex gap-4">
                                                    <div className={`size-10 rounded-full flex items-center justify-center text-[10px] font-black ${log.quantityChange > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                                        }`}>
                                                        {log.quantityChange > 0 ? 'IN' : 'OUT'}
                                                    </div>
                                                    <div>
                                                        <div className="text-white text-sm font-bold">{log.movementType?.replace(/_/g, ' ')}</div>
                                                        <div className="text-text-secondary text-[10px] uppercase font-bold tracking-wider">
                                                            {new Date(log.createdAt).toLocaleString()} • {log.locationId?.name}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`text-sm font-black ${log.quantityChange > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {log.quantityChange > 0 ? '+' : ''}{log.quantityChange}
                                                    </div>
                                                    <div className="text-[9px] text-text-secondary uppercase font-bold">Qty</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
