/**
 * Resolves the correct portal layout based on the current user's role.
 * Import this hook in any inventory page to get the right layout automatically.
 */
import SuperUserLayout from '../components/common/SuperUserLayout';
import ManagerLayout from '../components/common/ManagerLayout';
import StoreManagerLayout from '../components/common/StoreManagerLayout';
import PurchaseManagerLayout from '../components/common/PurchaseManagerLayout';
import EmployeeLayout from '../components/common/EmployeeLayout';
import InternLayout from '../components/common/InternLayout';
import { getCurrentUser } from './authService';

export function usePortalLayout(customLayout) {
    if (customLayout === 'employee') return EmployeeLayout;
    if (customLayout === 'intern') return InternLayout;

    const user = getCurrentUser();
    const role = user?.role;

    if (role === 'EMPLOYEE') return EmployeeLayout;
    if (role === 'INTERN') return InternLayout;
    if (role === 'SUPER_USER' || role === 'SUPER_ADMIN') return SuperUserLayout;
    if (role === 'STORE_MANAGER') return StoreManagerLayout;
    if (role === 'PURCHASE_MANAGER') return PurchaseManagerLayout;
    return ManagerLayout; // ENGINEER, MANAGER fallback
}
