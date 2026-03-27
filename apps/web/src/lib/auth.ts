const AUTH_TOKEN_KEY = "creative-vision-music.authToken";

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}
