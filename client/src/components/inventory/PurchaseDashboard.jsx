import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalLayout } from '../../services/usePortalLayout';
import inventoryService from '../../services/inventoryService';

export default function PurchaseDashboard() {
    const Layout = usePortalLayout();
    const navigate = useNavigate();
    const [stats, setStats] = useState({ vendors: 0, purchaseReqs: 0, draftPOs: 0, pendingApprovals: 0 });
    const [loading, setLoading] = useState(true);
    const [recentOrders, setRecentOrders] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [vendorRes, poRes, reqRes] = await Promise.all([
                    inventoryService.getVendors(),
                    inventoryService.getPurchaseOrders(),
                    inventoryService.getPurchaseRequests(),
                ]);
                const pos = poRes.data || [];
                setStats({
                    vendors: (vendorRes.data || []).length,
                    purchaseReqs: (reqRes.data || []).length,
                    draftPOs: pos.filter(p => p.status === 'DRAFT').length,
                    pendingApprovals: pos.filter(p => p.status === 'PENDING_ADMIN_APPROVAL').length,
                });
                setRecentOrders(pos.slice(0, 6));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const quickActions = [
        { label: 'Create Purchase Request', icon: 'request_quote', path: '/purchase/requests', color: 'from-violet-600 to-indigo-600' },
        { label: 'View Purchase Orders', icon: 'receipt_long', path: '/purchase/orders', color: 'from-indigo-600 to-blue-600' },
        { label: 'Review PO Approvals', icon: 'fact_check', path: '/purchase/approvals', color: 'from-purple-600 to-violet-600' },
        { label: 'Manage Vendors', icon: 'store', path: '/purchase/vendors', color: 'from-blue-600 to-indigo-600' },
    ];

    const statCards = [
        { label: 'Active Vendors', value: stats.vendors, icon: 'store', color: 'text-violet-400', bg: 'bg-violet-500/10' },
        { label: 'Open Requisitions', value: stats.purchaseReqs, icon: 'request_quote', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
        { label: 'Draft POs', value: stats.draftPOs, icon: 'receipt_long', color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { label: 'Pending Approval', value: stats.pendingApprovals, icon: 'pending_actions', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    ];

    const statusConfig = {
        DRAFT: { label: 'Draft', color: 'bg-slate-500/20 text-slate-400' },
        PENDING_ADMIN_APPROVAL: { label: 'Awaiting Approval', color: 'bg-amber-500/20 text-amber-400' },
        APPROVED: { label: 'Approved', color: 'bg-emerald-500/20 text-emerald-400' },
        PLACED: { label: 'Order Placed', color: 'bg-blue-500/20 text-blue-400' },
        RECEIVED: { label: 'Received', color: 'bg-teal-500/20 text-teal-400' },
        REJECTED: { label: 'Rejected', color: 'bg-red-500/20 text-red-400' },
        CLOSED: { label: 'Closed', color: 'bg-slate-700/50 text-slate-500' },
    };

    return (
        <Layout currentPage="purchase-dashboard">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-[#556070] tracking-tight mb-1">Purchase Overview</h1>
                        <p className="text-text-secondary">Procurement pipeline, vendor status and order approvals at a glance.</p>
                    </div>

                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        {statCards.map((card, idx) => (
                            <div key={idx} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 shadow-lg hover:border-violet-500/30 transition-all group">
                                <div className={`size-10 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
                                    <span className={`material-symbols-outlined ${card.color}`}>{card.icon}</span>
                                </div>
                                <p className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-1">{card.label}</p>
                                {loading ? (
                                    <div className="h-8 w-16 bg-border-dark rounded animate-pulse"></div>
                                ) : (
                                    <p className="text-2xl font-black text-[#556070]">{card.value}</p>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Quick Actions */}
                        <div className="lg:col-span-1">
                            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 shadow-xl">
                                <h2 className="text-lg font-bold text-[#556070] mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-violet-400">bolt</span>
                                    Quick Actions
                                </h2>
                                <div className="space-y-3">
                                    {quickActions.map((action, idx) => (
                                        <button key={idx} onClick={() => navigate(action.path)}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-border-dark hover:border-violet-500/30 transition-all group">
                                            <div className={`size-9 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform`}>
                                                <span className="material-symbols-outlined text-white text-sm">{action.icon}</span>
                                            </div>
                                            <span className="text-sm font-medium text-text-secondary group-hover:text-[#556070] transition-colors">{action.label}</span>
                                            <span className="material-symbols-outlined text-text-secondary ml-auto text-sm group-hover:text-violet-400 transition-colors">arrow_forward</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Recent Purchase Orders */}
                        <div className="lg:col-span-2">
                            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl shadow-xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-border-dark flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-[#556070] flex items-center gap-2">
                                        <span className="material-symbols-outlined text-violet-400">receipt_long</span>
                                        Recent Purchase Orders
                                    </h2>
                                    <button onClick={() => navigate('/purchase/orders')} className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors">
                                        View All →
                                    </button>
                                </div>
                                {loading ? (
                                    <div className="p-8 space-y-3">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse"></div>
                                        ))}
                                    </div>
                                ) : recentOrders.length === 0 ? (
                                    <div className="p-20 text-center">
                                        <span className="material-symbols-outlined text-border-dark text-5xl mb-4">receipt_long</span>
                                        <p className="text-text-secondary">No purchase orders yet.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border-dark">
                                        {recentOrders.map((po, idx) => {
                                            const cfg = statusConfig[po.status] || { label: po.status, color: 'bg-slate-500/20 text-slate-400' };
                                            return (
                                                <div key={idx} className="px-6 py-3 flex items-center justify-between hover:bg-background-dark/30 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                                                            <span className="material-symbols-outlined text-violet-400 text-sm">receipt_long</span>
                                                        </div>
                                                        <div>
                                                            <div className="text-[#556070] text-sm font-bold">{po.poNumber}</div>
                                                            <div className="text-text-secondary text-[11px]">{po.vendor?.name} • {new Date(po.createdAt).toLocaleDateString()}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right hidden md:block">
                                                            <div className="text-[#556070] text-sm font-bold">₹{(po.totalAmount || 0).toLocaleString()}</div>
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
