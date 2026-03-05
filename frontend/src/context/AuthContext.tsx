import {
  createContext,
  useContext,
  useState,
  useCallback,
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

  const login = useCallback((newTokens: StravaTokens) => {
    saveTokens(newTokens);
    setTokens(newTokens);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setTokens(null);
  }, []);

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!tokens) {
      throw new Error("Not authenticated");
    }
    if (!isTokenExpired(tokens)) {
      return tokens.access_token;
    }
    const refreshed = await refreshAccessToken(
      config.oauthWorkerUrl,
      tokens.refresh_token
    );
    saveTokens(refreshed);
    setTokens(refreshed);
    return refreshed.access_token;
  }, [tokens]);

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
