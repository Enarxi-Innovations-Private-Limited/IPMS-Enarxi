import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuth, getCurrentUser } from '../../services/authService.js';
import api from '../../services/api.js';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';

export default function PurchaseManagerLayout({ children, currentPage = 'purchase-dashboard' }) {
    const navigate = useNavigate();
    const user = getCurrentUser();
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);
    const sidebarRef = useRef(null);

    // Persistence for scroll position
    useEffect(() => {
        const sidebar = sidebarRef.current;
        if (sidebar) {
            const savedScroll = sessionStorage.getItem('pm_sidebar_scroll');
            if (savedScroll) {
                sidebar.scrollTop = parseInt(savedScroll, 10);
            }

            const handleScroll = () => {
                sessionStorage.setItem('pm_sidebar_scroll', sidebar.scrollTop);
            };

            sidebar.addEventListener('scroll', handleScroll);
            return () => sidebar.removeEventListener('scroll', handleScroll);
        }
    }, []);
    const [isProcurementOpen, setIsProcurementOpen] = useState(() => {
        const saved = localStorage.getItem('pm_proc_expanded');
        if (saved !== null) return saved === 'true';
        return ['purchase-requests', 'purchase-orders', 'purchase-approvals'].includes(currentPage);
    });

    const [isVendorOpen, setIsVendorOpen] = useState(() => {
        const saved = localStorage.getItem('pm_vendor_expanded');
        if (saved !== null) return saved === 'true';
        return ['purchase-vendors'].includes(currentPage);
    });

    const [isStockOpen, setIsStockOpen] = useState(() => {
        const saved = localStorage.getItem('pm_stock_expanded');
        if (saved !== null) return saved === 'true';
        return ['purchase-stock'].includes(currentPage);
    });

    const toggleProc = () => {
        const newState = !isProcurementOpen;
        setIsProcurementOpen(newState);
        localStorage.setItem('pm_proc_expanded', newState);
    };

    const toggleVendor = () => {
        const newState = !isVendorOpen;
        setIsVendorOpen(newState);
        localStorage.setItem('pm_vendor_expanded', newState);
    };

    const toggleStock = () => {
        const newState = !isStockOpen;
        setIsStockOpen(newState);
        localStorage.setItem('pm_stock_expanded', newState);
    };

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
            setTimeout(() => { setShowChangePassword(false); setPasswordSuccess(''); }, 2000);
        } catch (err) {
            setPasswordError(err.response?.data?.message || 'Failed to change password');
        } finally {
            setIsChangingPassword(false);
        }
    };

    // Accent colour token for Purchase Manager: indigo/violet
    const accent = {
        bg: 'bg-violet-500/10',
        text: 'text-violet-400',
        border: 'border-violet-500',
        icon: 'text-violet-400',
        badge: 'bg-violet-500/20 text-violet-400',
        gradient: 'from-violet-600 to-indigo-600',
        shadow: 'shadow-violet-500/20',
        hoverIcon: 'group-hover:text-violet-400',
        focusRing: 'focus:ring-violet-500',
        pulse: 'bg-violet-500',
    };

    const procurementMenu = [
        { id: 'purchase-requests', label: 'Purchase Requests', icon: 'request_quote', path: '/purchase/requests' },
        { id: 'purchase-orders', label: 'Purchase Orders', icon: 'receipt_long', path: '/purchase/orders' },
        { id: 'purchase-approvals', label: 'PO Approvals', icon: 'fact_check', path: '/purchase/approvals' },
    ];

    const vendorMenu = [
        { id: 'purchase-vendors', label: 'Vendors', icon: 'store', path: '/purchase/vendors' },
    ];

    const stockMenu = [
        { id: 'purchase-stock', label: 'Current Stock', icon: 'warehouse', path: '/purchase/stock' },
    ];

    const renderAccordion = ({ label, icon, isOpen, onToggle, items, groupLabel }) => (
        <div className="space-y-1">
            <button
                onClick={onToggle}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all group ${isOpen ? 'text-white' : 'text-text-secondary hover:text-white hover:bg-surface-dark'}`}
            >
                <div className="flex items-center gap-3">
                    <span className={`material-symbols-outlined ${isOpen ? accent.icon : accent.hoverIcon}`}>{icon}</span>
                    <span className="text-sm font-medium">{label}</span>
                </div>
                <span className={`material-symbols-outlined text-sm transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                <div className="pl-3 border-l border-border-dark/50 ml-4 py-1 space-y-0.5">
                    <h3 className="px-3 text-[9px] font-black tracking-widest text-text-secondary uppercase mb-2 opacity-40">{groupLabel}</h3>
                    {items.map(item => (
                        <a key={item.id} href={item.path}
                            onClick={(e) => { e.preventDefault(); navigate(item.path); }}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all group relative ${currentPage === item.id ? `${accent.text} font-bold` : 'text-text-secondary hover:text-white'}`}
                        >
                            <span className={`material-symbols-outlined text-lg ${currentPage === item.id ? accent.icon : accent.hoverIcon}`}>{item.icon}</span>
                            <span className="text-[13px]">{item.label}</span>
                            {currentPage === item.id && <div className={`absolute right-2 size-1.5 rounded-full ${accent.pulse} animate-pulse`}></div>}
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );

    const SidebarContent = ({ onNav }) => (
        <div className="flex flex-col h-full">
            <div className="p-6 shrink-0">
                <div className="flex gap-3 px-2">
                    <div className={`size-10 rounded-full shadow-lg ring-2 ring-border-dark bg-gradient-to-br ${accent.gradient} flex items-center justify-center shrink-0`}>
                        <span className="text-white font-bold text-sm">PM</span>
                    </div>
                    <div className="flex flex-col justify-center">
                        <h1 className="text-white text-base font-bold leading-none">IPMS</h1>
                        <p className="text-text-secondary text-xs font-normal leading-normal mt-0.5">Purchase Manager</p>
                    </div>
                </div>
            </div>

            <nav 
                ref={sidebarRef}
                className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-6 space-y-5"
            >
                {/* Overview */}
                <div>
                    <h2 className="px-3 text-[10px] font-black tracking-widest text-text-secondary uppercase mb-2 opacity-50">Overview</h2>
                    <a
                        href="/purchase"
                        onClick={(e) => { e.preventDefault(); onNav('/purchase'); }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group relative ${currentPage === 'purchase-dashboard' ? `${accent.bg} text-white shadow-sm` : 'text-text-secondary hover:bg-surface-dark hover:text-white'}`}
                    >
                        {currentPage === 'purchase-dashboard' && <div className="absolute left-0 top-2 bottom-2 w-1 bg-violet-500 rounded-r-full"></div>}
                        <span className={`material-symbols-outlined ${currentPage === 'purchase-dashboard' ? accent.icon : accent.hoverIcon}`}
                            style={currentPage === 'purchase-dashboard' ? { fontVariationSettings: "'FILL' 1" } : {}}>dashboard</span>
                        <span className="text-sm font-medium">Dashboard</span>
                    </a>
                </div>

                {renderAccordion({
                    label: 'Procurement', icon: 'shopping_cart_checkout',
                    isOpen: isProcurementOpen, onToggle: toggleProc,
                    items: procurementMenu, groupLabel: 'PURCHASE FLOW'
                })}
                {renderAccordion({
                    label: 'Vendor & Items', icon: 'store',
                    isOpen: isVendorOpen, onToggle: toggleVendor,
                    items: vendorMenu, groupLabel: 'MASTER DATA'
                })}
                {renderAccordion({
                    label: 'Stock Visibility', icon: 'warehouse',
                    isOpen: isStockOpen, onToggle: toggleStock,
                    items: stockMenu, groupLabel: 'READ ONLY'
                })}
            </nav>
        </div>
    );

    return (
        <div className="flex h-screen w-full overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex w-72 flex-col border-r border-border-dark bg-background-dark h-full shrink-0">
                <SidebarContent onNav={(p) => navigate(p)} />
            </aside>

            {/* Mobile Overlay */}
            <div className={`mobile-sidebar-overlay ${showMobileSidebar ? 'active' : ''}`} onClick={() => setShowMobileSidebar(false)}></div>

            {/* Mobile Sidebar */}
            <aside className={`mobile-sidebar ${showMobileSidebar ? 'active' : ''}`}>
                <div className="flex items-center justify-between p-4 border-b border-border-dark">
                    <span className="text-white font-bold">Purchase Manager</span>
                    <button onClick={() => setShowMobileSidebar(false)} className="text-text-secondary hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <SidebarContent onNav={(p) => { navigate(p); setShowMobileSidebar(false); }} />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-background-dark">
                <header className="flex items-center justify-between border-b border-border-dark bg-background-dark/95 backdrop-blur-sm px-6 py-4 z-10 sticky top-0">
                    <div className="flex items-center gap-4 lg:hidden">
                        <button className="text-text-secondary hover:text-white" onClick={() => setShowMobileSidebar(true)}>
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <span className="text-white font-bold text-lg">IPMS</span>
                    </div>
                    <div className="hidden md:flex flex-1 max-w-xl mx-4">
                        <GlobalSearch placeholder="Search vendors, orders, requests..." />
                    </div>
                    <div className="flex items-center gap-4">
                        <NotificationBell />
                        <div className="h-8 w-px bg-border-dark"></div>
                        <span className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${accent.badge} border border-violet-500/20`}>
                            <span className="material-symbols-outlined text-sm">shopping_cart_checkout</span>
                            Purchase Manager
                        </span>
                        <div className="relative">
                            <button
                                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                                className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-surface-dark transition-colors border border-transparent hover:border-border-dark"
                            >
                                <div className="hidden md:flex flex-col items-end">
                                    <span className="text-white text-sm font-semibold leading-tight">{user?.name || 'User'}</span>
                                    <span className="text-xs text-text-secondary font-medium">Purchase Manager</span>
                                </div>
                                <div className={`size-9 rounded-lg bg-gradient-to-br ${accent.gradient} flex items-center justify-center text-white font-bold shadow-md ${accent.shadow} ring-2 ring-background-dark`}>
                                    {user?.name?.charAt(0)?.toUpperCase() || 'P'}
                                </div>
                                <span className={`material-symbols-outlined text-text-secondary transition-transform duration-200 ${showProfileDropdown ? 'rotate-180' : ''}`}>expand_more</span>
                            </button>

                            {showProfileDropdown && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)}></div>
                                    <div className="absolute right-0 mt-2 w-72 bg-surface-dark border border-border-dark rounded-xl shadow-2xl z-50 overflow-hidden">
                                        <div className="p-4 border-b border-border-dark">
                                            <div className="flex items-center gap-3">
                                                <div className={`size-12 rounded-full bg-gradient-to-br ${accent.gradient} flex items-center justify-center`}>
                                                    <span className="text-white font-bold text-lg">{user?.name?.charAt(0)?.toUpperCase() || 'P'}</span>
                                                </div>
                                                <div>
                                                    <p className="text-white font-semibold">{user?.name || 'User'}</p>
                                                    <p className="text-text-secondary text-sm">{user?.email || ''}</p>
                                                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-bold rounded-full ${accent.badge}`}>PURCHASE_MANAGER</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-2">
                                            <button onClick={() => { setShowProfileDropdown(false); setShowChangePassword(true); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:text-white hover:bg-background-dark transition-colors">
                                                <span className="material-symbols-outlined text-xl">lock</span>
                                                <span className="text-sm font-medium">Change Password</span>
                                            </button>
                                        </div>
                                        <div className="p-2 border-t border-border-dark">
                                            <button onClick={handleLogout}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">
                                                <span className="material-symbols-outlined text-xl">logout</span>
                                                <span className="text-sm font-medium">Logout</span>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>
            </main>

            {/* Change Password Modal */}
            {showChangePassword && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowChangePassword(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className={`material-symbols-outlined ${accent.icon}`}>lock</span>
                                Change Password
                            </h2>
                        </div>
                        <form onSubmit={handleChangePassword} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Current Password *</label>
                                <input type="password" required className={`w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 ${accent.focusRing} focus:border-transparent outline-none focus:ring-2`} placeholder="Enter current password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">New Password *</label>
                                <input type="password" required className={`w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 ${accent.focusRing} focus:border-transparent outline-none focus:ring-2`} placeholder="Min 6 characters" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Confirm New Password *</label>
                                <input type="password" required className={`w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 ${accent.focusRing} focus:border-transparent outline-none focus:ring-2`} placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
                            </div>
                            {passwordError && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">{passwordError}</div>}
                            {passwordSuccess && <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg text-sm">{passwordSuccess}</div>}
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => { setShowChangePassword(false); setPasswordError(''); setPasswordSuccess(''); }} className="px-4 py-2 rounded-lg border border-border-dark text-white font-medium hover:bg-background-dark transition-colors" disabled={isChangingPassword}>Cancel</button>
                                <button type="submit" disabled={isChangingPassword} className={`inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r ${accent.gradient} text-white font-bold shadow-lg disabled:opacity-50`}>
                                    {isChangingPassword ? <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>Changing...</> : <><span className="material-symbols-outlined text-lg">check</span>Change Password</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
