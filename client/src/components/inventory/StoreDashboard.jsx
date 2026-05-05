import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalLayout } from '../../services/usePortalLayout';
import inventoryService from '../../services/inventoryService';

export default function StoreDashboard() {
    const Layout = usePortalLayout();
    const navigate = useNavigate();
    const [stats, setStats] = useState({ stock: 0, lowStock: 0, pending: 0, dispatches: 0 });
    const [loading, setLoading] = useState(true);
    const [recentMovements, setRecentMovements] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [stockRes, histRes] = await Promise.all([
                    inventoryService.getCurrentStock(),
                    inventoryService.getStockHistory(),
                ]);
                const stockData = stockRes.data || [];
                setStats({
                    stock: stockData.length,
                    lowStock: stockData.filter(i => i.quantityOnHand < 5).length,
                    pending: 0,
                    dispatches: 0,
                });
                setRecentMovements((histRes.data || []).slice(0, 8));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const quickActions = [
        { label: 'Store Requests', icon: 'assignment', path: '/store/requests', color: 'from-orange-500 to-red-500' },
        { label: 'Store Inward', icon: 'input', path: '/store/inward', color: 'from-amber-500 to-orange-500' },
        { label: 'Stock Uploads', icon: 'upload_file', path: '/store/uploads', color: 'from-amber-600 to-yellow-600' },
        { label: 'Stock Locations', icon: 'location_on', path: '/store/locations', color: 'from-yellow-500 to-amber-500' },
    ];

    const statCards = [
        { label: 'Store requests', value: stats.pending, icon: 'assignment', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
        { label: 'Ready dispatch', value: stats.dispatches, icon: 'local_shipping', color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Inward pending', value: 0, icon: 'input', color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { label: 'Stock approvals', value: 0, icon: 'check_circle', color: 'text-teal-400', bg: 'bg-teal-500/10' },
    ];

    return (
        <Layout currentPage="store-dashboard">
            <div className="p-4 lg:px-12 pb-24">
                <div className="max-w-7xl mx-auto w-full">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Store Operations</h1>
                        <p className="text-text-secondary">Real-time overview of warehouse activities and stock status.</p>
                    </div>

                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        {statCards.map((card, idx) => (
                            <div key={idx} className="bg-surface-dark border border-border-dark rounded-xl p-5 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all">
                                <div className={`size-10 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
                                    <span className={`material-symbols-outlined ${card.color}`}>{card.icon}</span>
                                </div>
                                <p className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-1">{card.label}</p>
                                {loading ? (
                                    <div className="h-8 w-16 bg-border-dark rounded animate-pulse"></div>
                                ) : (
                                    <p className="text-2xl font-black text-white">{card.value}</p>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Quick Actions */}
                        <div className="lg:col-span-1">
                            <div className="bg-surface-dark border border-border-dark rounded-2xl p-6 shadow-xl">
                                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-500">bolt</span>
                                    Quick Actions
                                </h2>
                                <div className="space-y-3">
                                    {quickActions.map((action, idx) => (
                                        <button key={idx} onClick={() => navigate(action.path)}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-background-dark/50 border border-border-dark hover:border-amber-500/30 transition-all group">
                                            <div className={`size-9 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform`}>
                                                <span className="material-symbols-outlined text-white text-sm">{action.icon}</span>
                                            </div>
                                            <span className="text-sm font-medium text-text-secondary group-hover:text-white transition-colors">{action.label}</span>
                                            <span className="material-symbols-outlined text-text-secondary ml-auto text-sm group-hover:text-amber-500 transition-colors">arrow_forward</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Recent Movements */}
                        <div className="lg:col-span-2">
                            <div className="bg-surface-dark border border-border-dark rounded-2xl shadow-xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-border-dark flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500">swap_vert</span>
                                        Recent Stock Movements
                                    </h2>
                                    <button onClick={() => navigate('/store/ledger')} className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors">
                                        View Full Ledger →
                                    </button>
                                </div>
                                {loading ? (
                                    <div className="p-8 space-y-3">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className="h-12 bg-background-dark/50 rounded-xl animate-pulse"></div>
                                        ))}
                                    </div>
                                ) : recentMovements.length === 0 ? (
                                    <div className="p-20 text-center">
                                        <span className="material-symbols-outlined text-border-dark text-5xl mb-4">swap_vert</span>
                                        <p className="text-text-secondary">No recent movements recorded.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border-dark">
                                        {recentMovements.map((log, idx) => (
                                            <div key={idx} className="px-6 py-3 flex items-center justify-between hover:bg-background-dark/30 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`size-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${log.quantityChange > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                        {log.quantityChange > 0 ? 'IN' : 'OUT'}
                                                    </div>
                                                    <div>
                                                        <div className="text-white text-sm font-medium">{log.item?.name || log.movementType?.replace(/_/g, ' ')}</div>
                                                        <div className="text-text-secondary text-[11px]">{new Date(log.createdAt).toLocaleString()}</div>
                                                    </div>
                                                </div>
                                                <span className={`text-sm font-bold ${log.quantityChange > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {log.quantityChange > 0 ? '+' : ''}{log.quantityChange}
                                                </span>
                                            </div>
                                        ))}
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
