import { createContext, useContext, useState, useEffect } from 'react';
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
    if (savedUser && token) {
      const data = JSON.parse(savedUser);
      setUser(data);
      setIsFitbitConnected(!!data.fitbit_connected);
    }
    setLoading(false);
  }, []);

  const login = async (googleCode) => {
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
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setIsFitbitConnected(false);
    toast.success('Logged out successfully');
  };

  const updateFitbitStatus = (status) => {
    setIsFitbitConnected(status);
    const updatedUser = { ...user, fitbit_connected: status };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      logout, 
      isFitbitConnected, 
      updateFitbitStatus 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
