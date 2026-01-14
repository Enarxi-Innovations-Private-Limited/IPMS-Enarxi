import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuth, getCurrentUser } from '../../services/authService.js';
import api from '../../services/api.js';

export default function StockAdminLayout({ children, currentPage = 'dashboard' }) {
    const navigate = useNavigate();
    const user = getCurrentUser();
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);

    const handleLogout = () => {
        clearAuth();
        navigate('/login', { replace: true });
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('New passwords do not match');
            return;
        }

        if (passwordForm.newPassword.length < 6) {
            setPasswordError('New password must be at least 6 characters');
            return;
        }

        try {
            setIsChangingPassword(true);
            await api.put('/auth/change-password', {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword,
            });
            setPasswordSuccess('Password changed successfully!');
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => {
                setShowChangePassword(false);
                setPasswordSuccess('');
            }, 2000);
        } catch (err) {
            setPasswordError(err.response?.data?.message || 'Failed to change password');
        } finally {
            setIsChangingPassword(false);
        }
    };

    const menuItems = [
        { id: 'dashboard', name: 'Dashboard', icon: 'dashboard', path: '/stock-admin' },
        { id: 'inventory', name: 'Inventory', icon: 'inventory_2', path: '/stock-admin/inventory' },
        { id: 'issue-return', name: 'Issue/Return', icon: 'swap_horiz', path: '/stock-admin/issue-return' },
        { id: 'purchase-orders', name: 'Purchase Orders', icon: 'shopping_cart', path: '/stock-admin/purchase-orders' },
        { id: 'price-comparison', name: 'Price Comparison', icon: 'currency_rupee', path: '/stock-admin/price-comparison' },
    ];

    return (
        <div className="flex h-screen bg-background-dark text-white overflow-hidden">
            {/* Sidebar */}
            <aside className="hidden lg:flex w-64 bg-surface-dark border-r border-border-dark flex-col shrink-0">
                {/* Logo */}
                <div className="p-6 border-b border-border-dark">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-2xl">warehouse</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">IPMS</h1>
                            <p className="text-xs text-text-secondary">Stock Management</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => navigate(item.path)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentPage === item.id
                                ? 'bg-primary/20 text-primary border border-primary/30'
                                : 'text-text-secondary hover:bg-surface-light hover:text-white'
                                }`}
                        >
                            <span className="material-symbols-outlined text-xl">{item.icon}</span>
                            <span className="font-medium">{item.name}</span>
                        </button>
                    ))}
                </nav>

                {/* User Profile */}
                <div className="p-4 border-t border-border-dark">
                    <div className="relative">
                        <button
                            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-surface-light transition-colors"
                        >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-lg">
                                {user?.name?.charAt(0) || 'S'}
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-white">{user?.name || 'Stock Admin'}</p>
                                <p className="text-xs text-text-secondary">Stock Admin</p>
                            </div>
                            <span className="material-symbols-outlined text-text-secondary">
                                {showProfileDropdown ? 'expand_less' : 'expand_more'}
                            </span>
                        </button>

                        {/* Profile Dropdown */}
                        {showProfileDropdown && (
                            <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface-light border border-border-dark rounded-lg shadow-xl overflow-hidden">
                                <button
                                    onClick={() => {
                                        setShowChangePassword(true);
                                        setShowProfileDropdown(false);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-surface-dark transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">lock</span>
                                    <span className="text-sm">Change Password</span>
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-surface-dark transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">logout</span>
                                    <span className="text-sm">Logout</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Mobile Sidebar Overlay */}
            <div
                className={`mobile-sidebar-overlay ${showMobileSidebar ? 'active' : ''}`}
                onClick={() => setShowMobileSidebar(false)}
            ></div>

            {/* Mobile Sidebar */}
            <aside className={`mobile-sidebar ${showMobileSidebar ? 'active' : ''}`}>
                <div className="flex flex-col h-full bg-surface-dark">
                    {/* Logo */}
                    <div className="p-6 border-b border-border-dark flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                                <span className="material-symbols-outlined text-2xl">warehouse</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white">IPMS</h1>
                                <p className="text-xs text-text-secondary">Stock Management</p>
                            </div>
                        </div>
                        <button onClick={() => setShowMobileSidebar(false)} className="text-text-secondary">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => { navigate(item.path); setShowMobileSidebar(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentPage === item.id
                                    ? 'bg-primary/20 text-primary border border-primary/30'
                                    : 'text-text-secondary hover:bg-surface-light hover:text-white'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-xl">{item.icon}</span>
                                <span className="font-medium">{item.name}</span>
                            </button>
                        ))}
                    </nav>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden flex flex-col h-full">
                {/* Mobile Header */}
                <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border-dark bg-surface-dark shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowMobileSidebar(true)} className="text-white hover:text-primary transition-colors">
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <span className="font-bold text-lg">Stock Admin</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
                        {user?.name?.charAt(0) || 'S'}
                    </div>
                </header>
                <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-background-dark">
                    {children}
                </div>
            </main>

            {/* Change Password Modal */}
            {showChangePassword && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-surface-dark rounded-2xl max-w-md w-full border border-border-dark">
                        <div className="p-6 border-b border-border-dark">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-white">Change Password</h2>
                                <button
                                    onClick={() => {
                                        setShowChangePassword(false);
                                        setPasswordError('');
                                        setPasswordSuccess('');
                                        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                                    }}
                                    className="text-text-secondary hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleChangePassword} className="p-6 space-y-4">
                            {passwordError && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                    {passwordError}
                                </div>
                            )}

                            {passwordSuccess && (
                                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                                    {passwordSuccess}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">
                                    Current Password
                                </label>
                                <input
                                    type="password"
                                    value={passwordForm.currentPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                    className="w-full px-4 py-2 bg-background-dark border border-border-dark rounded-lg text-white placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="Enter current password"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">
                                    New Password
                                </label>
                                <input
                                    type="password"
                                    value={passwordForm.newPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                    className="w-full px-4 py-2 bg-background-dark border border-border-dark rounded-lg text-white placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="Enter new password"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">
                                    Confirm New Password
                                </label>
                                <input
                                    type="password"
                                    value={passwordForm.confirmPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                    className="w-full px-4 py-2 bg-background-dark border border-border-dark rounded-lg text-white placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="Confirm new password"
                                    required
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowChangePassword(false);
                                        setPasswordError('');
                                        setPasswordSuccess('');
                                        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                                    }}
                                    className="flex-1 px-4 py-2 rounded-lg border border-border-dark text-white hover:bg-surface-light transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isChangingPassword}
                                    className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isChangingPassword ? 'Changing...' : 'Change Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bottom Navigation (Mobile) */}
            <nav className="bottom-nav bg-surface-dark border-t border-border-dark">
                {menuItems.slice(0, 4).map((item) => (
                    <a
                        key={item.id}
                        href={item.path}
                        onClick={(e) => {
                            e.preventDefault();
                            navigate(item.path);
                        }}
                        className={`bottom-nav-item ${currentPage === item.id ? 'active text-primary' : 'text-text-secondary'}`}
                    >
                        <span
                            className="material-symbols-outlined"
                            style={currentPage === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}
                        >
                            {item.icon}
                        </span>
                        <span className="label text-[10px]">{item.name.split(' ')[0]}</span>
                    </a>
                ))}
            </nav>
        </div>
    );
}
