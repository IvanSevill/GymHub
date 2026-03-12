import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import MaxLifts from './pages/MaxLifts';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import CalendarPage from './pages/CalendarPage';
import FitbitSuccess from './pages/FitbitSuccess';
import CalendarSelectionModal from './components/CalendarSelectionModal';
import { LayoutDashboard, Calendar as CalendarIcon, BarChart3, Settings as SettingsIcon, Award } from 'lucide-react';
import { workoutApi } from './api/gymhubApi';
import toast from 'react-hot-toast';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="loading-spinner" /></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
};

const Navigation = () => {
  const { user } = useAuth();
  const location = useLocation();
  const tabs = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Máximos', path: '/max-lifts', icon: Award },
    { name: 'Calendario', path: '/calendar', icon: CalendarIcon },
    { name: 'Análisis', path: '/analytics', icon: BarChart3 },
    { name: 'Ajustes', path: '/settings', icon: SettingsIcon },
  ];

  return (
    <>
      {/* Desktop Side Navigation */}
      <nav className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-72 glass-card rounded-l-none border-y-0 border-l-0 z-[60] p-8">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <LayoutDashboard size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-widest">GymHub</h1>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Motor de Entrenamiento</p>
          </div>
        </div>

        <div className="space-y-3 flex-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.path;
            return (
              <Link 
                key={tab.path} 
                to={tab.path} 
                className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${
                  isActive 
                    ? 'bg-primary text-white shadow-xl shadow-primary/20 scale-[1.02]' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-sm font-black uppercase tracking-widest">{tab.name}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pt-8 border-t border-white/5 flex items-center gap-4">
          <div className="relative">
            {user?.picture_url ? (
              <img src={user.picture_url} alt={user.name} className="w-10 h-10 rounded-xl border border-white/10" />
            ) : (
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black">{user?.name?.[0]}</div>
            )}
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-accent border-2 border-background rounded-full" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-black text-white truncate">{user?.name}</p>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">Atleta Elite</p>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 glass-card rounded-b-none border-x-0 border-b-0 py-3 px-6 z-50">
        <div className="max-w-screen-xl mx-auto flex justify-between items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.path;
            return (
              <Link 
                key={tab.path} 
                to={tab.path} 
                className={`flex flex-col items-center gap-1 transition-all ${
                  isActive ? 'text-primary scale-110' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon size={isActive ? 24 : 20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[9px] font-black uppercase tracking-wider">{tab.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile Top Header */}
      <header className="lg:hidden p-6 flex justify-between items-center bg-background/80 backdrop-blur-md sticky top-0 z-40 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
            <LayoutDashboard size={24} />
          </div>
          <h1 className="text-lg font-black text-white tracking-widest">GymHub</h1>
        </div>
        <div className="flex items-center gap-3">
          {user?.picture_url && (
            <img src={user?.picture_url} alt={user?.name} className="w-10 h-10 rounded-xl border border-white/10" />
          )}
        </div>
      </header>
    </>
  );
};

const SyncHandler = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id && user.has_calendar) {
      const lastSync = sessionStorage.getItem('lastSync');
      if (!lastSync) {
        const syncTask = async () => {
          const tid = 'calendar-sync';
          toast.loading('Sincronizando con Google Calendar...', { id: tid });
          try {
            await workoutApi.syncAll();
            sessionStorage.setItem('lastSync', Date.now());
            toast.success('Calendario sincronizado', { id: tid });
          } catch (err) {
            toast.error('Error en sincronización', { id: tid });
          }
        };
        syncTask();
      }
    }
  }, [user?.id, user?.has_calendar]);

  return null;
};

const AppContent = () => {
  const { user, setHasCalendar } = useAuth();

  return (
    <div className="flex min-h-screen">
      <Navigation />

      <main className="flex-1 lg:ml-72 flex flex-col min-h-screen">
        <div className="flex-1 p-6 md:p-12 lg:p-16">
          <SyncHandler />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/max-lifts" element={<MaxLifts />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/fitbit-success" element={<FitbitSuccess />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>

      <CalendarSelectionModal 
        isOpen={user && !user.has_calendar} 
        onComplete={() => setHasCalendar(true)} 
      />
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
