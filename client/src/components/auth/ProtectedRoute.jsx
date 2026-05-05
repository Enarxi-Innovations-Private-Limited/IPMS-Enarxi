import { Navigate, useLocation } from 'react-router-dom';
import { getCurrentUser, getToken, isTokenExpired } from '../../services/authService.js';

const ROLE_ROUTE_MAP = {
  SUPER_ADMIN: '/super',
  SUPER_USER: '/super',
  MANAGER: '/engineer',
  ENGINEER: '/engineer',
  EMPLOYEE: '/junior-engineer',
  JUNIOR_ENGINEER: '/junior-engineer',
  INTERN: '/intern',
  STORE_MANAGER: '/store',
  PURCHASE_MANAGER: '/purchase',
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



