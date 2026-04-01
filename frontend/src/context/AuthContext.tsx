import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  type StravaTokens,
  saveTokens,
  loadTokens,
  clearTokens,
  isTokenExpired,
  refreshAccessToken,
} from "../strava/auth";
import { config } from "../config";

interface AuthContextValue {
  tokens: StravaTokens | null;
  isAuthenticated: boolean;
  login: (tokens: StravaTokens) => void;
  logout: () => void;
  getAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<StravaTokens | null>(() => loadTokens());
  // Keep a ref so getAccessToken always reads the latest tokens without
  // needing to be recreated on every state change (avoids stale closures in
  // callbacks that capture getAccessToken, e.g. cloud sync debounced push).
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  // Deduplicate concurrent refresh calls — reuse the in-flight promise instead
  // of issuing a second refresh with an already-rotated refresh token.
  const refreshPromiseRef = useRef<Promise<string> | null>(null);

  const login = useCallback((newTokens: StravaTokens) => {
    saveTokens(newTokens);
    setTokens(newTokens);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setTokens(null);
  }, []);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const current = tokensRef.current;
    if (!current) {
      throw new Error("Not authenticated");
    }
    if (!isTokenExpired(current)) {
      return current.access_token;
    }
    // If a refresh is already in flight, wait for it rather than issuing a
    // second one that would fail with a rotated refresh token.
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }
    const promise = refreshAccessToken(config.oauthWorkerUrl, current.refresh_token)
      .then((refreshed) => {
        saveTokens(refreshed);
        setTokens(refreshed);
        return refreshed.access_token;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });
    refreshPromiseRef.current = promise;
    return promise;
  }, []); // stable — reads tokens via ref, never needs to be recreated

  return (
    <AuthContext.Provider
      value={{
        tokens,
        isAuthenticated: tokens !== null,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
