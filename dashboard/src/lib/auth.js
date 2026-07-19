export const AUTH_KEYS = {
  ACCESS_TOKEN: 'sockpit_access_token',
  REFRESH_TOKEN: 'sockpit_refresh_token',
  USER_DATA: 'sockpit_user_data',
};

export const getAccessToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_KEYS.ACCESS_TOKEN);
};

export const getRefreshToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_KEYS.REFRESH_TOKEN);
};

export const getUserData = () => {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(AUTH_KEYS.USER_DATA);
  try {
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const saveAuthData = (accessToken, refreshToken, user) => {
  if (typeof window === 'undefined') return;
  if (accessToken) localStorage.setItem(AUTH_KEYS.ACCESS_TOKEN, accessToken);
  if (refreshToken) localStorage.setItem(AUTH_KEYS.REFRESH_TOKEN, refreshToken);
  if (user) localStorage.setItem(AUTH_KEYS.USER_DATA, JSON.stringify(user));
};

export const clearAuthData = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(AUTH_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(AUTH_KEYS.USER_DATA);
};
