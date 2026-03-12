import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/gymhubApi';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFitbitConnected, setIsFitbitConnected] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (savedUser && savedUser !== 'undefined' && token && token !== 'undefined') {
      try {
        const data = JSON.parse(savedUser);
        setUser(data);
        setIsFitbitConnected(!!data.fitbit_connected);
      } catch (err) {
        console.error("Error parsing user data from localStorage", err);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (googleCode) => {
    const loginToast = toast.loading('Logging in...');
    try {
      const response = await authApi.loginWithGoogle(googleCode);
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(userData));
      
      setUser(userData);
      setIsFitbitConnected(!!userData.fitbit_connected);
      
      toast.success('Welcome back, ' + userData.name, { id: loginToast });
      return true;
    } catch (error) {
      toast.error('Login failed. Please try again.', { id: loginToast });
      console.error('Login failed', error);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('lastSync');
    setUser(null);
    setIsFitbitConnected(false);
    toast.success('Sesión cerrada correctamente');
  }, []);

  const updateFitbitStatus = useCallback((status) => {
    setIsFitbitConnected(status);
    setUser(prev => {
      const updatedUser = { ...prev, fitbit_connected: status };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  }, []);

  const setHasCalendar = useCallback((status) => {
    setUser(prev => {
      const updatedUser = { ...prev, has_calendar: status };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      logout, 
      isFitbitConnected, 
      updateFitbitStatus,
      setHasCalendar 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
