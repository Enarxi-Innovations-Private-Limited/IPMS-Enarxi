import { Navigate, useLocation } from 'react-router-dom';
import { getCurrentUser, getToken, isTokenExpired } from '../../services/authService.js';

const ROLE_ROUTE_MAP = {
  SUPER_USER: '/super',
  MANAGER: '/manager',
  EMPLOYEE: '/employee',
  INTERN: '/intern',
  STOCK_ADMIN: '/stock-admin',
};

export default function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();

  const token = getToken();
  const user = getCurrentUser();

  if (!token || isTokenExpired(token) || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const redirectTo = ROLE_ROUTE_MAP[user.role] || '/login';
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}



