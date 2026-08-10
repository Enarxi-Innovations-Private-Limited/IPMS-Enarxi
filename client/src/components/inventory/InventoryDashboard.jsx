import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import inventoryService from '../../services/inventoryService';
import { getCurrentUser } from '../../services/authService';
import { usePortalLayout } from '../../services/usePortalLayout';

const ROLE_ROUTE_MAP = {
    SUPER_USER: {
        stock: '/super/inventory',
        routing: '/super/inventory/routing',
        materialRequests: '/super/material-requests',
        inward: '/super/inventory/inward',
        purchaseOrders: '/super/inventory/purchase-orders',
        poApprovals: '/super/inventory/po-approvals',
        ledger: '/super/inventory/audit',
    },
    SUPER_ADMIN: {
        stock: '/super/inventory',
        routing: '/super/inventory/routing',
        materialRequests: '/super/material-requests',
        inward: '/super/inventory/inward',
        purchaseOrders: '/super/inventory/purchase-orders',
        poApprovals: '/super/inventory/po-approvals',
        ledger: '/super/inventory/audit',
    },
    MANAGER: {
        stock: '/engineer/inventory',
        routing: '/engineer/material-requests',
        materialRequests: '/engineer/material-requests',
        inward: '/engineer/inventory',
        purchaseOrders: '/engineer/inventory',
        poApprovals: '/engineer/inventory',
        ledger: '/engineer/inventory/ledger',
    },
    ENGINEER: {
        stock: '/engineer/inventory',
        routing: '/engineer/material-requests',
        materialRequests: '/engineer/material-requests',
        inward: '/engineer/inventory',
        purchaseOrders: '/engineer/inventory',
        poApprovals: '/engineer/inventory',
        ledger: '/engineer/inventory/ledger',
    },
    STORE_MANAGER: {
        stock: '/store/stock',
        routing: '/store/requests',
        materialRequests: '/store/requests',
        inward: '/store/inward',
        purchaseOrders: '/store/requests',
        poApprovals: '/store/approvals',
        ledger: '/store/ledger',
    },
    PURCHASE_MANAGER: {
        stock: '/purchase/stock',
        routing: '/purchase/requests',
        materialRequests: '/purchase/requests',
        inward: '/purchase/stock',
        purchaseOrders: '/purchase/orders',
        poApprovals: '/purchase/approvals',
        ledger: '/purchase/stock',
    }
};

export default function InventoryDashboard() {
    const Layout = usePortalLayout();
    const navigate = useNavigate();
    const currentUser = getCurrentUser();
    const role = String(currentUser?.role || '').toUpperCase();
    const routes = ROLE_ROUTE_MAP[role] || ROLE_ROUTE_MAP.SUPER_ADMIN;

    const [stats, setStats] = useState({
        totalSkus: 0,
        lowStockCount: 0,
        pendingMRs: 0,
        pendingPOs: 0
    });
    const [loading, setLoading] = useState(true);
    const [recentMovements, setRecentMovements] = useState([]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                setLoading(true);
                const [stockRes, mrRes, poRes, ledgerRes] = await Promise.all([
                    inventoryService.getCurrentStock(),
                    inventoryService.getMaterialRequests(),
                    inventoryService.getPurchaseOrders(),
                    inventoryService.getStockLedger()
                ]);

                const stock = stockRes.data;
                const totalSkus = stock.length;
                const lowStockCount = stock.filter((item) => item.quantityOnHand < 5).length;

                const pendingMRs = mrRes.data.filter((mr) => mr.status === 'SUBMITTED').length;
                const pendingPOs = poRes.data.filter((po) => po.status === 'PENDING_ADMIN_APPROVAL').length;

                setStats({
                    totalSkus,
                    lowStockCount,
                    pendingMRs,
                    pendingPOs
                });
                setRecentMovements(ledgerRes.data.slice(0, 5));
            } catch (err) {
                console.error('Failed to load dashboard data:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    const statCards = [
        { label: 'Total Components', value: stats.totalSkus, icon: 'inventory_2', color: 'text-primary', bg: 'bg-primary/10', path: routes.stock },
        { label: 'Critical Low Stock', value: stats.lowStockCount, icon: 'warning', color: 'text-amber-500', bg: 'bg-amber-500/10', path: routes.stock },
        { label: 'Awaiting Routing', value: stats.pendingMRs, icon: 'fork_right', color: 'text-blue-400', bg: 'bg-blue-400/10', path: routes.routing },
        { label: 'POs for Approval', value: stats.pendingPOs, icon: 'assignment_late', color: 'text-red-400', bg: 'bg-red-400/10', path: routes.poApprovals },
    ];

    const quickActions = [
        { label: 'Create MR', icon: 'add_shopping_cart', color: 'text-primary', bg: 'bg-primary/10', hoverBorder: 'hover:border-primary', path: routes.materialRequests },
        { label: 'Record Inward', icon: 'input', color: 'text-emerald-500', bg: 'bg-emerald-500/10', hoverBorder: 'hover:border-emerald-500', path: routes.inward },
        { label: 'Review POs', icon: 'assignment', color: 'text-amber-500', bg: 'bg-amber-500/10', hoverBorder: 'hover:border-amber-500', path: routes.purchaseOrders },
        { label: 'View Ledger', icon: 'history', color: 'text-blue-400', bg: 'bg-blue-400/10', hoverBorder: 'hover:border-blue-400', path: routes.ledger },
    ];

    return (
        <Layout currentPage="inv-dash">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-[#556070] tracking-tight">Inventory Intelligence</h1>
                        <p className="text-text-secondary">High-level overview of hardware assets and procurement health.</p>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="h-32 bg-white border border-slate-200 rounded-2xl animate-pulse"></div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
                            {statCards.map((card) => (
                                <button
                                    key={card.label}
                                    type="button"
                                    onClick={() => navigate(card.path)}
                                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-primary/50 transition-all text-left cursor-pointer"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`size-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                                            <span className={`material-symbols-outlined ${card.color}`}>{card.icon}</span>
                                        </div>
                                    </div>
                                    <p className="text-2xl font-black text-[#556070]">{card.value}</p>
                                    <p className="text-text-secondary text-[10px] font-bold uppercase tracking-widest mt-1">{card.label}</p>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white border border-slate-200 rounded-3xl p-8">
                            <h3 className="text-xl font-bold text-[#556070] mb-6">Quick Operations</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {quickActions.map((action) => (
                                    <button
                                        key={action.label}
                                        type="button"
                                        onClick={() => navigate(action.path)}
                                        className={`flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl ${action.hoverBorder} transition-all text-left`}
                                    >
                                        <div className={`size-10 rounded-lg ${action.bg} flex items-center justify-center ${action.color}`}>
                                            <span className="material-symbols-outlined">{action.icon}</span>
                                        </div>
                                        <span className="text-sm font-bold text-[#556070]">{action.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-3xl p-8 overflow-hidden">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-[#556070]">Recent Movements</h3>
                                <button type="button" onClick={() => navigate(routes.ledger)} className="text-xs text-primary font-bold hover:underline">See All</button>
                            </div>
                            <div className="space-y-4">
                                {recentMovements.length === 0 ? (
                                    <div className="py-10 text-center text-text-secondary text-sm">No recent activity</div>
                                ) : (
                                    recentMovements.map((log, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-background-dark/30 border border-border-dark/50">
                                            <div className="flex items-center gap-3">
                                                <div className={`size-8 rounded-full flex items-center justify-center text-[10px] font-bold ${log.quantityChange > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                    {log.quantityChange > 0 ? 'IN' : 'OUT'}
                                                </div>
                                                <div>
                                                    <div className="text-[#556070] text-xs font-bold">{log.itemId?.name || 'Component'}</div>
                                                    <div className="text-text-secondary text-[10px]">{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {log.movementType?.replace(/_/g, ' ')}</div>
                                                </div>
                                            </div>
                                            <div className={`text-xs font-black ${log.quantityChange > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {log.quantityChange > 0 ? '+' : ''}{log.quantityChange}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
