import React, { createContext, useContext, useEffect, useState } from "react";
import { User, authService } from "../services/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const TOKEN_KEY = "auth_token";

let _token: string | null = localStorage.getItem(TOKEN_KEY);

export const getAuthToken = () => _token;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      if (_token) {
        try {
          const userData = await authService.getCurrentUser();
          setUser(userData);
        } catch {
          _token = null;
          localStorage.removeItem(TOKEN_KEY);
        }
      }
      setLoading(false);
    };
    restore();
  }, []);

  const login = (token: string, userData: User) => {
    _token = token;
    localStorage.setItem(TOKEN_KEY, token);
    setUser(userData);
  };

  const logout = () => {
    _token = null;
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const userData = await authService.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error("Failed to refresh user:", error);
      logout();
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
