import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
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
    const [locations, setLocations] = useState([]);

    useEffect(() => {
        if (selectedItem) {
            fetchItemHistory(selectedItem.itemId || selectedItem._id || selectedItem.id);
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

        const fetchLocations = async () => {
            try {
                const res = await inventoryService.getLocations();
                setLocations(res.data);
            } catch (err) {
                console.error('Failed to fetch locations:', err);
            }
        };

        fetchStock();
        fetchLocations();
    }, []);

    const filteredStock = stock.filter(item =>
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.locationId?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalItems = stock.length;
    const lowStockCount = stock.filter(item => item.quantityOnHand < 5).length; // Example threshold

    const handleExportAuditExcel = () => {
        const auditRows = stock.map((item) => ({
            'Item Code': item.itemCode || '',
            'Item Name': item.name || '',
            'Location': item.locationId?.name || 'Main Warehouse',
            'Qty': item.quantityOnHand ?? 0,
            'In Hand Qty': ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(auditRows, {
            header: ['Item Code', 'Item Name', 'Location', 'Qty', 'In Hand Qty']
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Current Stock Audit');

        const now = new Date();
        const fileSuffix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        XLSX.writeFile(workbook, `Current_Stock_Audit_${fileSuffix}.xlsx`);
    };

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest border border-amber-500/20">Inventory Hub</span>
                            </div>
                            <h1 className="text-3xl md:text-4xl font-bold text-[#556070] tracking-tight mb-2">
                                Current Stock
                            </h1>
                            <p className="text-text-secondary text-lg">
                                Approved stock on hand by item and location.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleExportAuditExcel}
                            disabled={loading || stock.length === 0}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b2a55] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-300 transition hover:bg-[#13376c] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-base">download</span>
                            Export Audit Excel
                        </button>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 shadow-xl relative overflow-hidden group hover:border-amber-500/30 transition-all">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-3xl -mr-12 -mt-12 transition-all group-hover:bg-amber-500/10"></div>
                            <div className="flex items-center justify-between mb-4 text-amber-500">
                                <h3 className="text-text-secondary text-xs font-black uppercase tracking-widest">Total SKUs</h3>
                                <span className="material-symbols-outlined">inventory_2</span>
                            </div>
                            <p className="text-3xl font-black text-[#556070] leading-none">{totalItems}</p>
                        </div>

                        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 shadow-xl relative overflow-hidden group hover:border-red-500/30 transition-all">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-3xl -mr-12 -mt-12 transition-all group-hover:bg-red-500/10"></div>
                            <div className="flex items-center justify-between mb-4 text-red-500">
                                <h3 className="text-text-secondary text-xs font-black uppercase tracking-widest">Low Stock</h3>
                                <span className="material-symbols-outlined">warning</span>
                            </div>
                            <p className="text-3xl font-black text-[#556070] leading-none">{lowStockCount}</p>
                        </div>

                        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-3xl -mr-12 -mt-12 transition-all group-hover:bg-emerald-500/10"></div>
                            <div className="flex items-center justify-between mb-4 text-emerald-500">
                                <h3 className="text-text-secondary text-xs font-black uppercase tracking-widest">Warehouses</h3>
                                <span className="material-symbols-outlined">location_on</span>
                            </div>
                            <p className="text-3xl font-black text-[#556070] leading-none">{locations.length}</p>
                        </div>
                    </div>

                    {/* Table Section */}
                    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-border-dark bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                                    <span className="material-symbols-outlined">format_list_bulleted</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-[#556070] leading-none">Stock Registry</h2>
                                    <p className="text-text-secondary text-[11px] font-medium mt-1 uppercase tracking-wider">Live Inventory Sync</p>
                                </div>
                            </div>
                            <div className="relative w-full md:w-96">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary text-xl opacity-50">search</span>
                                <input
                                    type="text"
                                    placeholder="Search by ID, name or location..."
                                    className="w-full bg-background-dark/50 border border-border-dark rounded-xl py-3 pl-12 pr-4 text-[#556070] placeholder-text-secondary/30 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-20 text-center">
                                <div className="animate-spin size-12 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4 shadow-lg shadow-amber-500/20"></div>
                                <p className="text-text-secondary font-medium tracking-wide">Syncing Global Stock Ledger...</p>
                            </div>
                        ) : error ? (
                            <div className="p-20 text-center bg-red-500/5">
                                <span className="material-symbols-outlined text-red-500 text-6xl mb-4 drop-shadow-xl">error</span>
                                <p className="text-[#556070] font-bold text-xl">{error}</p>
                                <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-red-500 text-[#556070] rounded-lg font-bold hover:bg-red-600 transition-colors">Retry Connection</button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 border-b border-slate-200 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Item ID</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Name</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Class</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Package</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Location</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">On Hand</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Reserved</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary text-right">Available</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {filteredStock.map((item) => {
                                            const available = item.availableQuantity ?? ((item.quantityOnHand ?? 0) - (item.reservedQuantity ?? 0));
                                            return (
                                                <tr
                                                    key={item.id || item._id}
                                                    onClick={() => setSelectedItem(item)}
                                                    className="group hover:bg-amber-500/[0.03] transition-all cursor-pointer border-l-2 border-l-transparent hover:border-l-amber-500"
                                                >
                                                    <td className="px-6 py-4">
                                                        <span className="font-mono text-amber-500 text-sm font-black tracking-tight">{item.itemCode}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-[#556070] font-bold group-hover:text-amber-500 transition-colors">{item.name}</div>
                                                        <div className="text-text-secondary text-[10px] uppercase font-medium mt-0.5 tracking-wider opacity-60">Serial Tracking: {item.tracksSerial ? 'Yes' : 'No'}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary bg-surface-dark px-2 py-1 rounded border border-border-dark/50 group-hover:border-amber-500/20 group-hover:text-[#556070] transition-all">
                                                            {item.classificationId?.name || 'GENERIC'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-text-secondary text-sm font-medium">{item.package || '-'}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="size-1.5 rounded-full bg-emerald-500"></div>
                                                            <span className="text-text-secondary text-sm font-medium">{item.locationId?.name || 'Main Warehouse'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[#556070] font-black text-base">{item.quantityOnHand ?? 0}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-amber-500/60 font-black text-base">{item.reservedQuantity ?? 0}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className={`text-base font-black px-3 py-1 rounded-lg inline-block ${available <= 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                                            {available}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filteredStock.length === 0 && (
                                            <tr>
                                                <td colSpan="8" className="px-6 py-32 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <div className="size-20 rounded-full bg-background-dark/50 flex items-center justify-center mb-4 border border-dashed border-border-dark">
                                                            <span className="material-symbols-outlined text-4xl text-text-secondary/30">inventory_2</span>
                                                        </div>
                                                        <p className="text-text-secondary font-medium text-lg">No stock records found.</p>
                                                        <p className="text-text-secondary/50 text-sm mt-1">Try adjusting your filters or search terms.</p>
                                                    </div>
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
                                <h3 className="text-2xl font-black text-[#556070] leading-tight mb-2">{selectedItem.name}</h3>
                                <div className="text-primary font-mono text-sm mb-6">{selectedItem.itemCode}</div>

                                <div className="space-y-6">
                                    <div>
                                        <div className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-1">Available Quantity</div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-4xl font-black text-[#556070]">{selectedItem.availableQuantity ?? selectedItem.quantityOnHand}</span>
                                            <span className="text-text-secondary font-bold uppercase text-xs">{selectedItem.uom}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-1">Classification</div>
                                        <div className="text-[#556070] font-bold">{selectedItem.classification?.name || selectedItem.classificationId?.name || 'Unclassified'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Ledger Side */}
                            <div className="w-full md:w-2/3 p-8 overflow-y-auto custom-scrollbar">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-sm font-black text-[#556070] uppercase tracking-widest">Movement Ledger</h4>
                                    <button onClick={() => setSelectedItem(null)} className="text-text-secondary hover:text-[#556070]">
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
                                                        <div className="text-[#556070] text-sm font-bold">{log.movementType?.replace(/_/g, ' ')}</div>
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
