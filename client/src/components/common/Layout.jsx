import { useNavigate } from 'react-router-dom';
import { clearAuth, getCurrentUser } from '../../services/authService.js';

export default function Layout({ title, children }) {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-left">
          <span className="app-name">Internal PMS</span>
          <span className="divider">|</span>
          <span className="page-title">{title}</span>
        </div>
        <div className="topbar-right">
          {user && (
            <>
              <span className="user-name">
                {user.name} <span className="role-pill">{user.role}</span>
              </span>
              <button className="button ghost" onClick={handleLogout}>
                Logout
              </button>
            </>
          )}
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}



