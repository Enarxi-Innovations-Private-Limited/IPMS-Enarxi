const STORAGE_KEY = 'pms_auth';

export function saveAuth(token, user) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token,
      user,
    })
  );
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getAuth() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getToken() {
  const auth = getAuth();
  return auth?.token || null;
}

export function getCurrentUser() {
  const auth = getAuth();
  return auth?.user || null;
}



