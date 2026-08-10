import { useState, useEffect } from 'react';
import ManagerLayout from '../common/ManagerLayout';
import inventoryService from '../../services/inventoryService';
import { useNotifier } from '../common/AppNotificationProvider.jsx';

function getItemClassificationName(item) {
    return item?.classification?.name || item?.classificationId?.name || '-';
}

function formatSkuMappings(item) {
    const mappings = item?.skuMappings || [];
    const values = mappings
        .filter((m) => m?.sku)
        .map((m) => `${m.vendorCode || m.vendorId?.vendorCode || 'Vendor'}: ${m.sku}`);
    return values.length ? values.join(' | ') : '-';
}

function getItemClassificationId(item) {
    if (!item) return '';
    return String(item.classification?._id || item.classificationId?._id || item.classificationId || '');
}

export default function ManagerItemMasterPage() {
    const { error: notifyError } = useNotifier();
    const [items, setItems] = useState([]);
    const [classifications, setClassifications] = useState([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');

    const [expandedItem, setExpandedItem] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const [itemRes, classRes] = await Promise.all([
                    inventoryService.getItems(),
                    inventoryService.getClassifications(),
                ]);
                setItems(itemRes.data || []);
                setClassifications(classRes.data || []);
            } catch (err) {
                notifyError(err.response?.data?.message || 'Failed to load item master');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filteredItems = items.filter((item) => {
        const q = search.toLowerCase();
        const matchesSearch =
            !q ||
            item.name?.toLowerCase().includes(q) ||
            item.itemCode?.toLowerCase().includes(q) ||
            getItemClassificationName(item).toLowerCase().includes(q) ||
            item.package?.toLowerCase().includes(q) ||
            item.uom?.toLowerCase().includes(q);

        const matchesClass = !classFilter || getItemClassificationId(item) === classFilter;

        const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'active' && item.isActive !== false) ||
            (statusFilter === 'inactive' && item.isActive === false);

        return matchesSearch && matchesClass && matchesStatus;
    });

    const activeCount = items.filter((i) => i.isActive !== false).length;
    const inactiveCount = items.filter((i) => i.isActive === false).length;

    return (
        <ManagerLayout currentPage="inv-item-master">
            <div className="p-6 space-y-6">

                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-[#556070]">Item Master</h1>
                        <p className="text-text-secondary text-sm mt-1">
                            Browse the component library — reference item codes and specs when creating material requests.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                        <span className="material-symbols-outlined text-base">visibility</span>
                        View Only
                    </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-1">Total Items</p>
                        <p className="text-2xl font-bold text-[#556070]">{loading ? '—' : items.length}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-1">Active</p>
                        <p className="text-2xl font-bold text-emerald-600">{loading ? '—' : activeCount}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-1">Classifications</p>
                        <p className="text-2xl font-bold text-[#556070]">{loading ? '—' : classifications.length}</p>
                    </div>
                </div>

                {/* Table Card */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

                    {/* Filters */}
                    <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm opacity-50">search</span>
                            <input
                                type="text"
                                placeholder="Search by name, code, classification, package, UOM…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg py-2 pl-10 pr-4 text-[#556070] placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm bg-slate-50"
                            />
                        </div>
                        <div className="w-full sm:w-52">
                            <select
                                value={classFilter}
                                onChange={(e) => setClassFilter(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg py-2 px-3 text-[#556070] outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-slate-50"
                            >
                                <option value="">All Classifications</option>
                                {classifications.map((cls) => (
                                    <option key={cls._id || cls.id} value={cls._id || cls.id}>
                                        {cls.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="w-full sm:w-36">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg py-2 px-3 text-[#556070] outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-slate-50"
                            >
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>

                    {/* Results count */}
                    {!loading && (
                        <div className="px-5 py-2 border-b border-slate-100 bg-slate-50 text-xs text-text-secondary">
                            Showing <span className="font-bold text-[#556070]">{filteredItems.length}</span> of {items.length} items
                        </div>
                    )}

                    {/* Loading */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-secondary">
                            <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
                            <p className="text-sm">Loading item master…</p>
                        </div>
                    )}

                    {/* Table */}
                    {!loading && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">Item</th>
                                        <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">Classification</th>
                                        <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">Package</th>
                                        <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">UOM</th>
                                        <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">Vendor SKUs</th>
                                        <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredItems.map((item) => {
                                        const id = item._id || item.id;
                                        const isExpanded = expandedItem === id;
                                        return (
                                            <>
                                                <tr
                                                    key={id}
                                                    className="hover:bg-emerald-50/40 transition-colors cursor-pointer"
                                                    onClick={() => setExpandedItem(isExpanded ? null : id)}
                                                >
                                                    <td className="px-5 py-3.5">
                                                        <div className="font-semibold text-[#556070]">{item.name}</div>
                                                        <div className="text-xs font-mono text-emerald-600 mt-0.5">{item.itemCode}</div>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                                            {getItemClassificationName(item)}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-text-secondary">{item.package || '—'}</td>
                                                    <td className="px-5 py-3.5">
                                                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100">
                                                            {item.uom}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-text-secondary max-w-xs truncate text-xs">
                                                        {formatSkuMappings(item)}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                                            item.isActive !== false
                                                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                                : 'bg-red-50 text-red-500 border border-red-200'
                                                        }`}>
                                                            {item.isActive !== false ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </td>
                                                </tr>

                                                {/* Expandable description row */}
                                                {isExpanded && (
                                                    <tr key={`${id}-detail`} className="bg-emerald-50/30">
                                                        <td colSpan="6" className="px-5 py-3 border-b border-emerald-100">
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                                                <div>
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1">Description</p>
                                                                    <p className="text-[#556070]">{item.description || 'No description provided.'}</p>
                                                                </div>
                                                                {(item.skuMappings?.length > 0) && (
                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1">Vendor SKU Mappings</p>
                                                                        <div className="space-y-1">
                                                                            {item.skuMappings.filter(m => m?.sku).map((m, i) => (
                                                                                <div key={i} className="flex items-center gap-2 text-xs">
                                                                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono font-bold border border-slate-200">
                                                                                        {m.vendorCode || m.vendorId?.vendorCode || 'Vendor'}
                                                                                    </span>
                                                                                    <span className="text-text-secondary">{m.sku}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        );
                                    })}

                                    {filteredItems.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="px-5 py-16 text-center">
                                                <span className="material-symbols-outlined text-4xl text-slate-300 block mb-3">inventory_2</span>
                                                <p className="text-text-secondary text-sm">No items match your filters.</p>
                                                {(search || classFilter || statusFilter !== 'active') && (
                                                    <button
                                                        onClick={() => { setSearch(''); setClassFilter(''); setStatusFilter('active'); }}
                                                        className="mt-3 text-xs text-emerald-600 hover:underline font-medium"
                                                    >
                                                        Clear filters
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Helper tip */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-sm">
                    <span className="material-symbols-outlined text-lg mt-0.5 shrink-0">info</span>
                    <p>
                        Click any row to expand its description and vendor SKU details.
                        Use item codes when adding components to a material request.
                    </p>
                </div>

            </div>
        </ManagerLayout>
    );
}
