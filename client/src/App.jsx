import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import LoginPage from './components/auth/LoginPage.jsx';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
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
import ManagerDashboard from './components/dashboard/ManagerDashboard.jsx';
import ManagerProjectsPage from './components/dashboard/ManagerProjectsPage.jsx';
import ManagerTasksPage from './components/dashboard/ManagerTasksPage.jsx';
import ManagerTeamPage from './components/dashboard/ManagerTeamPage.jsx';
import StockOverview from './components/inventory/StockOverview.jsx';
import DamagedStockPage from './components/inventory/DamagedStockPage.jsx';
import MaterialRequestPage from './components/inventory/MaterialRequestPage.jsx';
import ProjectReturn from './components/inventory/ProjectReturn.jsx';
import ProjectReturnReview from './components/inventory/ProjectReturnReview.jsx';
import AdminMRRouting from './components/inventory/AdminMRRouting.jsx';
import VendorManagement from './components/inventory/VendorManagement.jsx';
import PurchasePlanning from './components/inventory/PurchasePlanning.jsx';
import PurchaseOrdersPage from './components/inventory/PurchaseOrdersPage.jsx';
import InventoryDashboard from './components/inventory/InventoryDashboard.jsx';
import PurchaseInward from './components/inventory/PurchaseInward.jsx';
import MasterDataManagement from './components/inventory/MasterDataManagement.jsx';
import InventoryAudit from './components/inventory/InventoryAudit.jsx';
import Traceability from './components/inventory/Traceability.jsx';
import StockTransfer from './components/inventory/StockTransfer.jsx';
import AdjustmentReview from './components/inventory/AdjustmentReview.jsx';
import StoreDispatchPage from './components/inventory/StoreDispatchPage.jsx';
import StoreRequestsPage from './components/inventory/StoreRequestsPage.jsx';
import ClassificationsPage from './components/inventory/ClassificationsPage.jsx';
import StockLocationsPage from './components/inventory/StockLocationsPage.jsx';
import StockUploadsPage from './components/inventory/StockUploadsPage.jsx';
import POApprovalsPage from './components/inventory/POApprovalsPage.jsx';
import StoreDashboard from './components/inventory/StoreDashboard.jsx';
import PurchaseDashboard from './components/inventory/PurchaseDashboard.jsx';
import PurchasingHub from './components/inventory/PurchasingHub.jsx';
import { clearAuth, getCurrentUser, getToken, isTokenExpired } from './services/authService.js';

const ROLE_ROUTE_MAP = {
  SUPER_ADMIN: '/super',
  SUPER_USER: '/super',
  MANAGER: '/engineer',
  ENGINEER: '/engineer', // Legacy
  EMPLOYEE: '/junior-engineer',
  JUNIOR_ENGINEER: '/junior-engineer', // Legacy
  INTERN: '/intern',
  STORE_MANAGER: '/store',
  PURCHASE_MANAGER: '/purchase',
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/super"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <SuperUserDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/projects"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <SuperUserProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/teams"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <SuperUserTeamsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/backups"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <SuperUserBackupsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <StockOverview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/material-requests"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <MaterialRequestPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/routing"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <AdminMRRouting />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/vendors"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <VendorManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/purchase-planning"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <PurchasePlanning />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/purchase-orders"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <PurchaseOrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/inward"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <PurchaseInward />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/classifications"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <ClassificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/locations"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <StockLocationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/uploads"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <StockUploadsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/po-approvals"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <POApprovalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/master-data"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <MasterDataManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/dashboard"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <InventoryDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/adjustments"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <AdjustmentReview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/traceability"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <Traceability />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/fulfillment"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <StoreRequestsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/dispatches"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <StoreDispatchPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/audit"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <InventoryAudit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/damaged-stock"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <DamagedStockPage currentPage="inv-damaged-stock" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/transfers"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <StockTransfer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/project-returns"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <ProjectReturnReview currentPage="inv-project-returns" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super/inventory/adjustments"
        element={
          <ProtectedRoute allowedRoles={['SUPER_USER', 'SUPER_ADMIN']}>
            <AdjustmentReview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/junior-engineer"
        element={
          <ProtectedRoute allowedRoles={['JUNIOR_ENGINEER', 'EMPLOYEE']}>
            <EmployeeDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/junior-engineer/projects"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYEE']}>
            <EmployeeProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/junior-engineer/tasks"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYEE']}>
            <EmployeeTasksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/junior-engineer/dispatches"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYEE']}>
            <StoreDispatchPage />
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
        path="/intern/tasks"
        element={
          <ProtectedRoute allowedRoles={['INTERN']}>
            <InternTasksPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/engineer"
        element={
          <ProtectedRoute allowedRoles={['ENGINEER', 'MANAGER']}>
            <ManagerDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/engineer/projects"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <ManagerProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/engineer/tasks"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <ManagerTasksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/engineer/team"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <ManagerTeamPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/engineer/inventory"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <StockOverview currentPage="inventory" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/engineer/material-requests"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <MaterialRequestPage currentPage="material-requests" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/engineer/inventory/returns"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <ProjectReturn currentPage="returns" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/engineer/inventory/dispatches"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <StoreDispatchPage currentPage="inv-dispatches" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/engineer/inventory/ledger"
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <InventoryAudit currentPage="inv-ledger" />
          </ProtectedRoute>
        }
      />

      {/* Store Manager Routes */}
      <Route path="/store" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><StoreDashboard /></ProtectedRoute>} />
      <Route path="/store/requests" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><StoreRequestsPage /></ProtectedRoute>} />
      <Route path="/store/routing" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><Navigate to="/store/requests" replace /></ProtectedRoute>} />
      <Route path="/store/inward" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><PurchaseInward /></ProtectedRoute>} />
      <Route path="/store/dispatches" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><StoreDispatchPage currentPage="store-dispatches" /></ProtectedRoute>} />
      <Route path="/store/transfers" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><StockTransfer /></ProtectedRoute>} />
      <Route path="/store/stock" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><StockOverview currentPage="store-stock" /></ProtectedRoute>} />
      <Route path="/store/damaged-stock" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><DamagedStockPage currentPage="store-damaged-stock" /></ProtectedRoute>} />
      <Route path="/store/uploads" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><StockUploadsPage /></ProtectedRoute>} />
      <Route path="/store/approvals" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><AdjustmentReview /></ProtectedRoute>} />
      <Route path="/store/project-returns" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><ProjectReturnReview currentPage="store-project-returns" /></ProtectedRoute>} />
      <Route path="/store/ledger" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><InventoryAudit currentPage="store-ledger" /></ProtectedRoute>} />
      <Route path="/store/locations" element={<ProtectedRoute allowedRoles={['STORE_MANAGER']}><StockLocationsPage /></ProtectedRoute>} />

      {/* Purchase Manager Routes */}
      <Route path="/purchase" element={<ProtectedRoute allowedRoles={['PURCHASE_MANAGER']}><PurchaseDashboard /></ProtectedRoute>} />
      <Route path="/purchase/requests" element={<ProtectedRoute allowedRoles={['PURCHASE_MANAGER']}><PurchasePlanning /></ProtectedRoute>} />
      <Route path="/purchase/orders" element={<ProtectedRoute allowedRoles={['PURCHASE_MANAGER']}><PurchaseOrdersPage /></ProtectedRoute>} />
      <Route path="/purchase/approvals" element={<ProtectedRoute allowedRoles={['PURCHASE_MANAGER']}><POApprovalsPage /></ProtectedRoute>} />
      <Route path="/purchase/vendors" element={<ProtectedRoute allowedRoles={['PURCHASE_MANAGER']}><VendorManagement /></ProtectedRoute>} />
      <Route path="/purchase/bom" element={<ProtectedRoute allowedRoles={['PURCHASE_MANAGER']}><PurchasingHub /></ProtectedRoute>} />

      <Route path="/purchase/stock" element={<ProtectedRoute allowedRoles={['PURCHASE_MANAGER']}><StockOverview currentPage="purchase-stock" /></ProtectedRoute>} />

      <Route path="/" element={<RoleRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RoleRedirect() {
  const token = getToken();
  if (!token || isTokenExpired(token)) {
    clearAuth();
    return <Navigate to="/login" replace />;
  }
  const user = getCurrentUser();
  if (!user) {
    clearAuth();
    return <Navigate to="/login" replace />;
  }
  const path = ROLE_ROUTE_MAP[user.role];
  if (!path) {
    console.error('No route defined for role:', user.role);
    clearAuth();
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={path} replace />;
}

export default App;
