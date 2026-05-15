import { useEffect, useMemo, useState } from 'react';
import inventoryService from '../../services/inventoryService';
import { usePortalLayout } from '../../services/usePortalLayout.js';

export default function DamagedStockPage({ currentPage: propCurrentPage }) {
    const Layout = usePortalLayout();
    const currentPage = propCurrentPage || 'damaged-stock';
    const [stock, setStock] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const response = await inventoryService.getDamagedStock();
                setStock(response.data || []);
            } catch (err) {
                setError('Failed to fetch damaged stock records.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const filteredStock = useMemo(() => stock.filter((item) =>
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.locationId?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    ), [stock, searchTerm]);

    const totalDamagedUnits = filteredStock.reduce((sum, item) => sum + Number(item.quantityOnHand || 0), 0);

    return (
        <Layout currentPage={currentPage}>
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-500/20">Quarantine View</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-[#556070] tracking-tight mb-2">Damaged Stock</h1>
                        <p className="text-text-secondary text-lg">Damaged or unusable returns held separately from current usable stock.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-4 text-red-400">
                                <h3 className="text-text-secondary text-xs font-black uppercase tracking-widest">Damaged SKUs</h3>
                                <span className="material-symbols-outlined">inventory_2</span>
                            </div>
                            <p className="text-3xl font-black text-[#556070] leading-none">{filteredStock.length}</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-4 text-amber-400">
                                <h3 className="text-text-secondary text-xs font-black uppercase tracking-widest">Damaged Units</h3>
                                <span className="material-symbols-outlined">warning</span>
                            </div>
                            <p className="text-3xl font-black text-[#556070] leading-none">{totalDamagedUnits}</p>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-[#556070] leading-none">Damaged Stock Registry</h2>
                                <p className="text-text-secondary text-[11px] font-medium mt-1 uppercase tracking-wider">Held outside current usable stock</p>
                            </div>
                            <div className="relative w-full md:w-96">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary text-xl opacity-50">search</span>
                                <input
                                    type="text"
                                    placeholder="Search damaged stock..."
                                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-[#556070] placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-20 text-center">
                                <div className="animate-spin size-12 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-4 shadow-lg shadow-red-500/20"></div>
                                <p className="text-text-secondary font-medium tracking-wide">Loading damaged stock register...</p>
                            </div>
                        ) : error ? (
                            <div className="p-20 text-center bg-red-500/5">
                                <span className="material-symbols-outlined text-red-500 text-6xl mb-4 drop-shadow-xl">error</span>
                                <p className="text-white font-bold text-xl">{error}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Item ID</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Name</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Class</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Location</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Damaged Qty</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary text-right">Updated</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {filteredStock.map((item) => (
                                            <tr key={item.id || item._id} className="hover:bg-red-500/[0.03] transition-all border-l-2 border-l-transparent hover:border-l-red-500">
                                                <td className="px-6 py-4">
                                                    <span className="font-mono text-red-400 text-sm font-black tracking-tight">{item.itemCode}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-[#556070] font-bold">{item.name}</div>
                                                    <div className="text-text-secondary text-[10px] uppercase font-medium mt-0.5 tracking-wider opacity-60">
                                                        Serial Tracking: {item.tracksSerial ? 'Yes' : 'No'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-text-secondary text-sm font-medium">{item.classificationId?.name || 'GENERIC'}</td>
                                                <td className="px-6 py-4 text-text-secondary text-sm font-medium">{item.locationId?.name || 'Damaged Hold'}</td>
                                                <td className="px-6 py-4">
                                                    <span className="text-red-400 font-black text-base">{item.quantityOnHand ?? 0}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right text-text-secondary text-sm">
                                                    {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredStock.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-6 py-32 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <div className="size-20 rounded-full bg-background-dark/50 flex items-center justify-center mb-4 border border-dashed border-border-dark">
                                                            <span className="material-symbols-outlined text-4xl text-text-secondary/30">inventory_2</span>
                                                        </div>
                                                        <p className="text-text-secondary font-medium text-lg">No damaged stock records found.</p>
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
        </Layout>
    );
}
