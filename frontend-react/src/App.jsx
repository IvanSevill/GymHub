import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/CalendarPage';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import FitbitSuccess from './pages/FitbitSuccess';
import { LayoutDashboard, Calendar as CalendarIcon, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { workoutApi } from './api/gymhubApi';
import toast from 'react-hot-toast';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="loading-spinner" /></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
};

const Navigation = () => {
  const location = useLocation();
  const tabs = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Calendar', path: '/calendar', icon: CalendarIcon },
    { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    { name: 'Settings', path: '/settings', icon: SettingsIcon },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass-card rounded-b-none border-x-0 border-b-0 py-3 px-6 md:top-0 md:bottom-auto md:rounded-t-none md:border-b md:border-t-0 z-50">
      <div className="max-w-screen-xl mx-auto flex justify-between items-center md:justify-center md:gap-12">
        <div className="hidden md:flex items-center gap-2 mr-auto font-bold text-primary text-xl tracking-tight">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">G</div>
          GymHub
        </div>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.path;
          return (
            <Link 
              key={tab.path} 
              to={tab.path} 
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 transition-all ${
                isActive ? 'text-primary scale-110' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={isActive ? 24 : 20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] md:text-sm font-bold uppercase tracking-wider">{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

const SyncHandler = () => {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const syncTask = async () => {
        const tid = toast.loading('Syncing with Google Calendar...');
        try {
          await workoutApi.syncAll();
          toast.success('Calendar in sync', { id: tid });
        } catch (err) {
          toast.error('Sync failed, but you can still browse', { id: tid });
        }
      };
      syncTask();
    }
  }, [location.pathname, user]);

  return null;
};

const AppContent = () => {
  return (
    <div className="min-h-screen pb-24 md:pb-0 md:pt-20">
      <SyncHandler />
      <Navigation />
      <main className="max-w-screen-xl mx-auto p-4 md:p-8 animate-in">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/fitbit-success" element={<FitbitSuccess />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster 
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px'
            }
          }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ProtectedRoute><AppContent /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
