import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';
import LoginPage from './components/auth/LoginPage.jsx';
import SuperUserDashboard from './components/dashboard/SuperUserDashboard.jsx';
import SuperUserTeamsPage from './components/dashboard/SuperUserTeamsPage.jsx';
import SuperUserProjectsPage from './components/dashboard/SuperUserProjectsPage.jsx';
import SuperUserBackupsPage from './components/dashboard/SuperUserBackupsPage.jsx';
import EmployeeDashboard from './components/dashboard/EmployeeDashboard.jsx';
import EmployeeProjectsPage from './components/dashboard/EmployeeProjectsPage.jsx';
import EmployeeTasksPage from './components/dashboard/EmployeeTasksPage.jsx';
import InternDashboard from './components/dashboard/InternDashboard.jsx';
import InternProjectsPage from './components/dashboard/InternProjectsPage.jsx';
import InternTasksPage from './components/dashboard/InternTasksPage.jsx';
import StockAdminDashboard from './components/dashboard/StockAdminDashboard.jsx';
import ManagerDashboard from './components/dashboard/ManagerDashboard.jsx';
import ManagerProjectsPage from './components/dashboard/ManagerProjectsPage.jsx';
import ManagerTasksPage from './components/dashboard/ManagerTasksPage.jsx';
import ManagerTeamPage from './components/dashboard/ManagerTeamPage.jsx';
import InventoryPage from './components/stock/InventoryPage.jsx';
import IssueReturnPage from './components/stock/IssueReturnPage.jsx';
import PurchaseOrdersPage from './components/stock/PurchaseOrdersPage.jsx';
import PriceComparisonPage from './components/stock/PriceComparisonPage.jsx';
import { getCurrentUser } from './services/authService.js';

const ROLE_ROUTE_MAP = {
  SUPER_USER: '/super',
  MANAGER: '/manager',
  EMPLOYEE: '/employee',
  INTERN: '/intern',
  STOCK_ADMIN: '/stock-admin',
};

function ProtectedRoute({ children, allowedRoles }) {
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    const user = getCurrentUser();
    setState({ loading: false, user });
  }, []);

  if (state.loading) {
    return (
      <div className="centered">
        <div className="card">Loading...</div>
      </div>
    );
  }

  if (!state.user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(state.user.role)) {
    const redirectTo = ROLE_ROUTE_MAP[state.user.role] || '/login';
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/super"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER']}>
            <SuperUserDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/projects"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER']}>
            <SuperUserProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/teams"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER']}>
            <SuperUserTeamsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/backups"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER']}>
            <SuperUserBackupsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYEE']}>
            <EmployeeDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee/projects"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYEE']}>
            <EmployeeProjectsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/intern"
        element={
          <ProtectedRoute allowedRoles={['INTERN']}>
            <InternDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/intern/projects"
        element={
          <ProtectedRoute allowedRoles={['INTERN']}>
            <InternProjectsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <ManagerDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/projects"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <ManagerProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/tasks"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <ManagerTasksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/team"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <ManagerTeamPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/stock-admin"
        element={
          <ProtectedRoute allowedRoles={['STOCK_ADMIN']}>
            <StockAdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stock-admin/inventory"
        element={
          <ProtectedRoute allowedRoles={['STOCK_ADMIN']}>
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stock-admin/issue-return"
        element={
          <ProtectedRoute allowedRoles={['STOCK_ADMIN']}>
            <IssueReturnPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stock-admin/purchase-orders"
        element={
          <ProtectedRoute allowedRoles={['STOCK_ADMIN']}>
            <PurchaseOrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stock-admin/price-comparison"
        element={
          <ProtectedRoute allowedRoles={['STOCK_ADMIN']}>
            <PriceComparisonPage />
          </ProtectedRoute>
        }
      />


      <Route path="/" element={<RoleRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RoleRedirect() {
  const user = getCurrentUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  const path = ROLE_ROUTE_MAP[user.role] || '/login';
  return <Navigate to={path} replace />;
}

export default App;
