import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StockAdminLayout from '../common/StockAdminLayout';
import api from '../../services/api';

export default function StockAdminDashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [stats, setStats] = useState({
        totalItems: 0,
        totalValue: 0,
        lowStock: 0,
        outOfStock: 0,
        issuedItems: 0,
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const response = await api.get('/stock/products/stats');
            setStats(response.data);
            setLoading(false);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load data');
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <StockAdminLayout currentPage="dashboard">
                <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-text-secondary">Loading dashboard...</p>
                    </div>
                </div>
            </StockAdminLayout>
        );
    }

    return (
        <StockAdminLayout currentPage="dashboard">
            <div className="p-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Stock Management Dashboard</h1>
                    <p className="text-text-secondary">Welcome to the inventory management system</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                        {error}
                    </div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-2xl text-blue-400">inventory_2</span>
                            </div>
                        </div>
                        <p className="text-text-secondary text-sm mb-1">Total Items</p>
                        <p className="text-3xl font-bold text-white">{stats.totalItems}</p>
                    </div>

                    <div className="bg-surface-dark border border-border-dark rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-2xl text-green-400">payments</span>
                            </div>
                        </div>
                        <p className="text-text-secondary text-sm mb-1">Total Value</p>
                        <p className="text-3xl font-bold text-white">₹{stats.totalValue.toLocaleString()}</p>
                    </div>

                    <div className="bg-surface-dark border border-border-dark rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 rounded-lg bg-red-500/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-2xl text-red-400">error</span>
                            </div>
                        </div>
                        <p className="text-text-secondary text-sm mb-1">Out of Stock</p>
                        <p className="text-3xl font-bold text-white">{stats.outOfStock}</p>
                    </div>

                    <div className="bg-surface-dark border border-border-dark rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-2xl text-purple-400">swap_horiz</span>
                            </div>
                        </div>
                        <p className="text-text-secondary text-sm mb-1">Issued Items</p>
                        <p className="text-3xl font-bold text-white">{stats.issuedItems}</p>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <button onClick={() => navigate('/stock-admin/inventory')} className="bg-gradient-to-br from-primary to-primary-hover p-6 rounded-xl text-left hover:shadow-xl hover:scale-[1.02] transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-lg bg-white/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-3xl text-white">add_circle</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">Add Product</h3>
                                <p className="text-white/80 text-sm">Add new item to inventory</p>
                            </div>
                        </div>
                    </button>

                    <button onClick={() => navigate('/stock-admin/issue-return')} className="bg-gradient-to-br from-accent to-accent-hover p-6 rounded-xl text-left hover:shadow-xl hover:scale-[1.02] transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-lg bg-white/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-3xl text-white">output</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">Issue Product</h3>
                                <p className="text-white/80 text-sm">Assign items to employees</p>
                            </div>
                        </div>
                    </button>
                </div>

                {/* Alerts Section */}
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="material-symbols-outlined text-2xl text-yellow-400">notifications</span>
                        <h2 className="text-xl font-bold text-white">Alerts & Notifications</h2>
                    </div>

                    <div className="space-y-3">
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-4">
                            <span className="material-symbols-outlined text-xl text-red-400">error</span>
                            <div className="flex-1">
                                <p className="text-white font-medium">Out of Stock Items</p>
                                <p className="text-text-secondary text-sm">6 items are currently out of stock and need immediate attention</p>
                            </div>
                            <button onClick={() => navigate('/stock-admin/inventory?filter=out_of_stock')} className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors">
                                View Items
                            </button>
                        </div>

                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-4">
                            <span className="material-symbols-outlined text-xl text-blue-400">info</span>
                            <div className="flex-1">
                                <p className="text-white font-medium">Stock Management System Active</p>
                                <p className="text-text-secondary text-sm">System is ready for inventory management. Head to Inventory to get started.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </StockAdminLayout>
    );
}
