import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuth, getCurrentUser } from '../../services/authService.js';
import api from './../../services/api.js';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';

export default function InternLayout({ children, currentPage = 'dashboard' }) {
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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/intern' },
    { id: 'projects', label: 'My Projects', icon: 'folder', path: '/intern/projects' },
    { id: 'tasks', label: 'My Tasks', icon: 'task_alt', path: '/intern/tasks' },
    { id: 'purchase-items', label: 'Item Master', icon: 'inventory_2', path: '/intern/inventory/items' },
  ];

  return (
    <div className="light-theme flex h-screen w-full overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r border-slate-200 shadow-sm bg-white border-r border-slate-200 shadow-sm">
        <div className="flex flex-col gap-6 p-4">
          <div className="flex gap-3 px-2 mt-2">
            <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 shadow-lg ring-2 ring-slate-100 bg-gradient-primary flex items-center justify-center">
              <span className="text-white font-bold text-lg">IP</span>
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-[#556070] text-base font-bold leading-none">IPMS</h1>
              <p className="text-text-secondary text-xs font-normal leading-normal mt-1">Internal Project Manager</p>
            </div>
          </div>
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <a
                key={item.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${currentPage === item.id
                  ? 'bg-primary/10 text-[#556070] border-l-4 border-primary shadow-sm'
                  : 'text-text-secondary hover:bg-slate-50 hover:text-[#556070]'
                  }`}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.path);
                }}
              >
                <span
                  className={`material-symbols-outlined transition-colors ${currentPage === item.id ? 'text-primary' : 'group-hover:text-primary'
                    }`}
                  style={currentPage === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {item.icon}
                </span>
                <span className="text-sm font-medium">{item.label}</span>
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <div
        className={`mobile-sidebar-overlay ${showMobileSidebar ? 'active' : ''}`}
        onClick={() => setShowMobileSidebar(false)}
      ></div>

      {/* Mobile Sidebar */}
      <aside className={`mobile-sidebar ${showMobileSidebar ? 'active' : ''}`}>
        <div className="flex flex-col gap-6 p-4">
          <div className="flex items-center justify-between px-2 mt-2">
            <div className="flex gap-3">
              <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 shadow-lg ring-2 ring-border-dark bg-gradient-primary flex items-center justify-center">
                <span className="text-[#556070] font-bold text-lg">IP</span>
              </div>
              <div className="flex flex-col justify-center">
                <h1 className="text-[#556070] text-base font-bold leading-none">IPMS</h1>
                <p className="text-text-secondary text-xs font-normal leading-normal mt-1">Internal Project Manager</p>
              </div>
            </div>
            <button
              onClick={() => setShowMobileSidebar(false)}
              className="text-text-secondary hover:text-[#556070]"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <a
                key={item.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${currentPage === item.id
                  ? 'bg-primary/10 text-[#556070] border-l-4 border-primary shadow-sm'
                  : 'text-text-secondary hover:bg-slate-50 hover:text-[#556070]'
                  }`}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.path);
                  setShowMobileSidebar(false);
                }}
              >
                <span
                  className={`material-symbols-outlined transition-colors ${currentPage === item.id ? 'text-primary' : 'group-hover:text-primary'
                    }`}
                  style={currentPage === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {item.icon}
                </span>
                <span className="text-sm font-medium">{item.label}</span>
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#ECF1FF]">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 shadow-sm bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-4 lg:hidden">
            <button
              className="text-text-secondary hover:text-[#556070]"
              onClick={() => setShowMobileSidebar(true)}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="text-[#556070] font-bold text-lg">IPMS</span>
          </div>
          <div className="hidden md:flex flex-1 max-w-xl mx-4">
            <GlobalSearch placeholder="Search projects, tasks..." />
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="h-8 w-px bg-border-dark"></div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200 shadow-sm"
              >
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-[#556070] text-sm font-semibold leading-tight">{user?.name || 'User'}</span>
                  <span className="text-xs text-text-secondary font-medium">{user?.role?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) || 'Intern'}</span>
                </div>
                <div className="size-9 rounded-lg bg-gradient-primary flex items-center justify-center text-white font-bold shadow-md shadow-primary/20 ring-2 ring-background-dark">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <span className={`material-symbols-outlined text-text-secondary transition-transform duration-200 ${showProfileDropdown ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>

              {/* Dropdown Menu */}
              {showProfileDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)}></div>
                  <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 shadow-sm rounded-xl shadow-2xl z-50 overflow-hidden">
                    {/* User Info */}
                    <div className="p-4 border-b border-slate-200 shadow-sm bg-gradient-surface">
                      <div className="flex items-center gap-3">
                        <div className="size-12 rounded-full bg-gradient-primary flex items-center justify-center">
                          <span className="text-[#556070] font-bold text-lg">
                            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div>
                          <p className="text-[#556070] font-semibold">{user?.name || 'User'}</p>
                          <p className="text-text-secondary text-sm">{user?.email || 'email@example.com'}</p>
                          <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/20 text-purple-400">
                            {user?.role || 'INTERN'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="p-2">
                      <button
                        onClick={() => { setShowProfileDropdown(false); setShowChangePassword(true); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:text-[#556070] hover:bg-background-dark transition-colors"
                      >
                        <span className="material-symbols-outlined text-xl">lock</span>
                        <span className="text-sm font-medium">Change Password</span>
                      </button>
                      <button
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:text-[#556070] hover:bg-background-dark transition-colors"
                      >
                        <span className="material-symbols-outlined text-xl">help</span>
                        <span className="text-sm font-medium">Help & Support</span>
                      </button>
                    </div>

                    {/* Logout */}
                    <div className="p-2 border-t border-slate-200 shadow-sm">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                      >
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
          <div className="relative bg-white border border-slate-200 shadow-sm rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 shadow-sm bg-gradient-surface">
              <h2 className="text-lg font-semibold text-[#556070] flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">lock</span>
                Change Password
              </h2>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Current Password *</label>
                <input type="password" required className="w-full bg-white border border-slate-200 shadow-sm rounded-lg px-4 py-3 text-[#556070] placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" placeholder="Enter current password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">New Password *</label>
                <input type="password" required className="w-full bg-white border border-slate-200 shadow-sm rounded-lg px-4 py-3 text-[#556070] placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" placeholder="Enter new password (min 6 characters)" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Confirm New Password *</label>
                <input type="password" required className="w-full bg-white border border-slate-200 shadow-sm rounded-lg px-4 py-3 text-[#556070] placeholder-text-secondary/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
              </div>
              {passwordError && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">{passwordError}</div>}
              {passwordSuccess && <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg text-sm">{passwordSuccess}</div>}
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => { setShowChangePassword(false); setPasswordError(''); setPasswordSuccess(''); }} className="px-4 py-2 rounded-lg border border-slate-200 shadow-sm text-[#556070] font-medium hover:bg-background-dark transition-colors" disabled={isChangingPassword}>Cancel</button>
                <button type="submit" disabled={isChangingPassword} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-primary text-white font-bold shadow-lg shadow-blue-900/50 hover:shadow-blue-900/70 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                  {isChangingPassword ? <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>Changing...</> : <><span className="material-symbols-outlined text-lg">check</span>Change Password</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Navigation (Mobile) */}
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <a
            key={item.id}
            href={item.path}
            onClick={(e) => {
              e.preventDefault();
              navigate(item.path);
            }}
            className={`bottom-nav-item ${currentPage === item.id ? 'active' : ''}`}
          >
            <span
              className="material-symbols-outlined"
              style={currentPage === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              {item.icon}
            </span>
            <span className="label">{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
