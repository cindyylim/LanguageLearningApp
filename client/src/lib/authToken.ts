const AUTH_TOKEN_KEY = 'auth_token';

let authToken: string | null = null;

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

authToken = readStoredToken();

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null | undefined): void {
  if (token === undefined) {
    return;
  }

  authToken = token;

  try {
    if (token) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
  }
}
