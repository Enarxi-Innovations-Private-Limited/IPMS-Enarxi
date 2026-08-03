const STORAGE_KEY = 'pms_auth';

export function saveAuth(token, user) {
  const payload = { token, user };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function getAuth() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getToken() {
  return getAuth()?.token || null;
}

export function getCurrentUser() {
  return getAuth()?.user || null;
}

export function normalizeDepartment(department) {
  return String(department || '').trim().toUpperCase();
}

export function canAccessInventory(user = getCurrentUser()) {
  if (!user?.role) return false;

  const role = String(user.role).trim().toUpperCase();
  const department = normalizeDepartment(user.department);

  if (role === 'SUPER_ADMIN' || role === 'SUPER_USER') return true;
  if (role === 'STORE_MANAGER' || role === 'PURCHASE_MANAGER') return true;
  if (role === 'MANAGER' || role === 'ENGINEER') return department === 'HARDWARE';

  return false;
}

function base64UrlDecode(input) {
  // Convert base64url -> base64
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with '='
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  // Decode
  return decodeURIComponent(
    atob(padded)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Returns true if token is expired (or malformed).
 * Adds a small clock-skew buffer to prevent edge-of-expiry race conditions.
 */
export function isTokenExpired(token, clockSkewSeconds = 30) {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowSeconds + clockSkewSeconds;
}

export function hasValidToken() {
  const token = getToken();
  if (!token) return false;
  return !isTokenExpired(token);
}



