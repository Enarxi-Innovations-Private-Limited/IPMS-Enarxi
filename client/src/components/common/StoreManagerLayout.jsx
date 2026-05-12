import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuth, getCurrentUser } from '../../services/authService.js';
import api from '../../services/api.js';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';

export default function StoreManagerLayout({ children, currentPage = 'store-dashboard' }) {
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
            const savedScroll = sessionStorage.getItem('sm_sidebar_scroll');
            if (savedScroll) {
                sidebar.scrollTop = parseInt(savedScroll, 10);
            }

            const handleScroll = () => {
                sessionStorage.setItem('sm_sidebar_scroll', sidebar.scrollTop);
            };

            sidebar.addEventListener('scroll', handleScroll);
            return () => sidebar.removeEventListener('scroll', handleScroll);
        }
    }, []);
    const [isStoreOpen, setIsStoreOpen] = useState(() => {
        const saved = localStorage.getItem('sm_store_expanded');
        if (saved !== null) return saved === 'true';
        return ['store-requests', 'store-inward', 'store-uploads'].includes(currentPage);
    });

    const [isAdminSetupOpen, setIsAdminSetupOpen] = useState(() => {
        const saved = localStorage.getItem('sm_admin_expanded');
        if (saved !== null) return saved === 'true';
        return ['store-locations'].includes(currentPage);
    });

    const [isReportsOpen, setIsReportsOpen] = useState(() => {
        const saved = localStorage.getItem('sm_reports_expanded');
        if (saved !== null) return saved === 'true';
        return ['store-reports'].includes(currentPage);
    });

    const toggleStore = () => {
        const newState = !isStoreOpen;
        setIsStoreOpen(newState);
        localStorage.setItem('sm_store_expanded', newState);
    };

    const toggleAdmin = () => {
        const newState = !isAdminSetupOpen;
        setIsAdminSetupOpen(newState);
        localStorage.setItem('sm_admin_expanded', newState);
    };

    const toggleReports = () => {
        const newState = !isReportsOpen;
        setIsReportsOpen(newState);
        localStorage.setItem('sm_reports_expanded', newState);
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

    // Accent colour token for Store Manager: amber
    const accent = {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500',
        icon: 'text-amber-500',
        badge: 'bg-amber-500/20 text-amber-400',
        gradient: 'from-amber-500 to-orange-500',
        ring: 'ring-amber-500/30',
        shadow: 'shadow-amber-500/20',
    };

    const overviewMenu = [
        { id: 'store-dashboard', label: 'Overview', icon: 'dashboard', path: '/store' },
    ];

    const adminSetupMenu = [
        { id: 'store-locations', label: 'Stock Locations', icon: 'location_on', path: '/store/locations' },
    ];

    const storeMenu = [
        { id: 'store-requests', label: 'Store Requests', icon: 'assignment', path: '/store/requests' },
        { id: 'store-inward', label: 'Store Inward', icon: 'input', path: '/store/inward' },
        { id: 'store-dispatches', label: 'Store Dispatches', icon: 'local_shipping', path: '/store/dispatches' },
        { id: 'store-uploads', label: 'Stock Uploads', icon: 'upload', path: '/store/uploads' },
    ];

    const reportsMenu = [
        { id: 'store-stock', label: 'Current Stock', icon: 'inventory_2', path: '/store/stock' },
        { id: 'store-ledger', label: 'Stock Ledger', icon: 'history', path: '/store/ledger' },
    ];

    const SidebarContent = ({ onNavigate }) => (
        <div className="flex flex-col h-full">
            {/* Brand */}
            <div className="p-6 shrink-0">
                <div className="flex gap-3 px-2">
                    <div className={`size-10 rounded-full shadow-lg ring-2 ring-border-dark bg-gradient-to-br ${accent.gradient} flex items-center justify-center shrink-0`}>
                        <span className="text-white font-bold text-sm">SM</span>
                    </div>
                    <div className="flex flex-col justify-center">
                        <h1 className="text-white text-base font-bold leading-none">IPMS</h1>
                        <p className="text-text-secondary text-xs font-normal leading-normal mt-0.5">Store Manager</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav 
                ref={sidebarRef}
                className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar px-4 pb-10"
            >
                {/* Overview */}
                <div className="space-y-1">
                    <div className="px-3 py-2 flex items-center justify-between group cursor-default">
                        <span className="text-[10px] font-black tracking-widest text-text-secondary uppercase opacity-50">Overview</span>
                        <span className="material-symbols-outlined text-xs text-text-secondary opacity-30">remove</span>
                    </div>
                    {overviewMenu.map(item => (
                        <a key={item.id} href={item.path}
                            onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group relative ${currentPage === item.id ? `${accent.bg} text-white shadow-sm` : 'text-text-secondary hover:bg-surface-dark hover:text-white'}`}
                        >
                            {currentPage === item.id && <div className={`absolute left-0 top-2 bottom-2 w-1 bg-amber-500 rounded-r-full`}></div>}
                            <span className={`material-symbols-outlined ${currentPage === item.id ? accent.icon : 'group-hover:text-amber-500'}`}
                                style={currentPage === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}>{item.icon}</span>
                            <span className="text-sm font-medium">{item.label}</span>
                        </a>
                    ))}
                </div>

                {/* Admin Setup */}
                <div className="space-y-1">
                    <button
                        onClick={toggleAdmin}
                        className={`w-full flex items-center justify-between px-3 py-2 group cursor-pointer transition-colors ${isAdminSetupOpen ? 'text-white' : 'text-text-secondary hover:text-white'}`}
                    >
                        <span className="text-[10px] font-black tracking-widest uppercase opacity-50">Admin Setup</span>
                        <span className={`material-symbols-outlined text-xs transition-transform duration-300 ${isAdminSetupOpen ? '' : 'rotate-180'}`}>{isAdminSetupOpen ? 'remove' : 'add'}</span>
                    </button>
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isAdminSetupOpen ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="space-y-0.5 pt-1">
                            {adminSetupMenu.map(item => (
                                <a key={item.id} href={item.path}
                                    onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all group relative ${currentPage === item.id ? `${accent.bg} text-white` : 'text-text-secondary hover:text-white hover:bg-surface-dark/50'}`}
                                >
                                    <span className={`material-symbols-outlined text-lg ${currentPage === item.id ? accent.icon : 'group-hover:text-amber-500'}`}>{item.icon}</span>
                                    <span className="text-sm">{item.label}</span>
                                    {currentPage === item.id && <div className="absolute right-2 size-1 rounded-full bg-amber-500"></div>}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Store */}
                <div className="space-y-1">
                    <button
                        onClick={toggleStore}
                        className={`w-full flex items-center justify-between px-3 py-2 group cursor-pointer transition-colors ${isStoreOpen ? 'text-white' : 'text-text-secondary hover:text-white'}`}
                    >
                        <span className="text-[10px] font-black tracking-widest uppercase opacity-50">Store</span>
                        <span className={`material-symbols-outlined text-xs transition-transform duration-300 ${isStoreOpen ? '' : 'rotate-180'}`}>{isStoreOpen ? 'remove' : 'add'}</span>
                    </button>
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isStoreOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="space-y-0.5 pt-1">
                            {storeMenu.map(item => (
                                <a key={item.id} href={item.path}
                                    onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all group relative ${currentPage === item.id ? `${accent.bg} text-white` : 'text-text-secondary hover:text-white hover:bg-surface-dark/50'}`}
                                >
                                    <span className={`material-symbols-outlined text-lg ${currentPage === item.id ? accent.icon : 'group-hover:text-amber-500'}`}>{item.icon}</span>
                                    <span className="text-sm">{item.label}</span>
                                    {currentPage === item.id && <div className="absolute right-2 size-1 rounded-full bg-amber-500"></div>}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Stock Reports */}
                <div className="space-y-1">
                    <button
                        onClick={toggleReports}
                        className={`w-full flex items-center justify-between px-3 py-2 group cursor-pointer transition-colors ${isReportsOpen ? 'text-white' : 'text-text-secondary hover:text-white'}`}
                    >
                        <span className="text-[10px] font-black tracking-widest uppercase opacity-50">Stock Reports</span>
                        <span className={`material-symbols-outlined text-xs transition-transform duration-300 ${isReportsOpen ? '' : 'rotate-180'}`}>{isReportsOpen ? 'remove' : 'add'}</span>
                    </button>
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isReportsOpen ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="space-y-0.5 pt-1">
                            {reportsMenu.map(item => (
                                <a key={item.id} href={item.path}
                                    onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all group relative ${currentPage === item.id ? `${accent.bg} text-white` : 'text-text-secondary hover:text-white hover:bg-surface-dark/50'}`}
                                >
                                    <span className={`material-symbols-outlined text-lg ${currentPage === item.id ? accent.icon : 'group-hover:text-amber-500'}`}>{item.icon}</span>
                                    <span className="text-sm">{item.label}</span>
                                    {currentPage === item.id && <div className="absolute right-2 size-1 rounded-full bg-amber-500"></div>}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </nav>
        </div>
    );

    return (
        <div className="flex h-screen w-full overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex w-72 flex-col border-r border-border-dark bg-background-dark h-full shrink-0">
                <SidebarContent onNavigate={(path) => navigate(path)} />
            </aside>

            {/* Mobile Overlay */}
            <div className={`mobile-sidebar-overlay ${showMobileSidebar ? 'active' : ''}`} onClick={() => setShowMobileSidebar(false)}></div>

            {/* Mobile Sidebar */}
            <aside className={`mobile-sidebar ${showMobileSidebar ? 'active' : ''}`}>
                <div className="flex items-center justify-between p-4 border-b border-border-dark">
                    <span className="text-white font-bold">Store Manager</span>
                    <button onClick={() => setShowMobileSidebar(false)} className="text-text-secondary hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <SidebarContent onNavigate={(path) => { navigate(path); setShowMobileSidebar(false); }} />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-background-dark">
                {/* Header */}
                <header className="flex items-center justify-between border-b border-border-dark bg-background-dark/95 backdrop-blur-sm px-6 py-4 z-10 sticky top-0">
                    <div className="flex items-center gap-4 lg:hidden">
                        <button className="text-text-secondary hover:text-white" onClick={() => setShowMobileSidebar(true)}>
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <span className="text-white font-bold text-lg">IPMS</span>
                    </div>
                    <div className="hidden md:flex flex-1 max-w-xl mx-4">
                        <GlobalSearch placeholder="Search stock, requests, dispatches..." />
                    </div>
                    <div className="flex items-center gap-4">
                        <NotificationBell />
                        <div className="h-8 w-px bg-border-dark"></div>
                        {/* Role badge */}
                        <span className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${accent.badge} border border-amber-500/20`}>
                            <span className="material-symbols-outlined text-sm">storefront</span>
                            Store Manager
                        </span>
                        <div className="relative">
                            <button
                                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                                className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-surface-dark transition-colors border border-transparent hover:border-border-dark"
                            >
                                <div className="hidden md:flex flex-col items-end">
                                    <span className="text-white text-sm font-semibold leading-tight">{user?.name || 'User'}</span>
                                    <span className="text-xs text-text-secondary font-medium">Store Manager</span>
                                </div>
                                <div className={`size-9 rounded-lg bg-gradient-to-br ${accent.gradient} flex items-center justify-center text-white font-bold shadow-md ${accent.shadow} ring-2 ring-background-dark`}>
                                    {user?.name?.charAt(0)?.toUpperCase() || 'S'}
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
                                                    <span className="text-white font-bold text-lg">{user?.name?.charAt(0)?.toUpperCase() || 'S'}</span>
                                                </div>
                                                <div>
                                                    <p className="text-white font-semibold">{user?.name || 'User'}</p>
                                                    <p className="text-text-secondary text-sm">{user?.email || ''}</p>
                                                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-bold rounded-full ${accent.badge}`}>STORE_MANAGER</span>
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

                {/* Page Content */}
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
                                <input type="password" required className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="Enter current password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">New Password *</label>
                                <input type="password" required className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="Min 6 characters" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Confirm New Password *</label>
                                <input type="password" required className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-white placeholder-text-secondary/50 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
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
