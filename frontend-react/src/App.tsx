import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import Layout from "./components/Layout";
import BackendWakeup from "./components/BackendWakeup";
import CalendarSetup from "./pages/CalendarSetup";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Workouts from "./pages/Workouts";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
import Records from "./pages/Records";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import { workoutService } from "./services/workout";

import "./App.css";

export const CALENDAR_CACHE_KEY = "gymhub_selected_calendar_id";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading, refreshUser } = useAuth();
  const [restoringCalendar, setRestoringCalendar] = useState(false);

  useEffect(() => {
    if (loading || !user || user.has_calendar) return;

    const cached = localStorage.getItem(CALENDAR_CACHE_KEY);
    if (!cached) return;

    setRestoringCalendar(true);
    workoutService
      .setCalendar(cached)
      .then(() => refreshUser())
      .catch(() => localStorage.removeItem(CALENDAR_CACHE_KEY))
      .finally(() => setRestoringCalendar(false));
  }, [loading, user?.has_calendar]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || restoringCalendar) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-white text-sm">
        Cargando…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!user.has_calendar) {
    return (
      <CalendarSetup
        fetchCalendars={workoutService.getCalendars}
        onSelect={async (id) => {
          localStorage.setItem(CALENDAR_CACHE_KEY, id);
          await workoutService.setCalendar(id);
          await workoutService.syncAllFromCalendar().catch(() => {});
          window.location.href = "/";
        }}
        onCreateCalendar={async (name) => {
          const { id } = await workoutService.createCalendar(name);
          localStorage.setItem(CALENDAR_CACHE_KEY, id);
          await workoutService.setCalendar(id);
          await workoutService.syncAllFromCalendar().catch(() => {});
          window.location.href = "/";
        }}
      />
    );
  }

  return <Layout>{children}</Layout>;
};

const AppContent: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workouts"
          element={
            <ProtectedRoute>
              <Workouts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/records"
          element={
            <ProtectedRoute>
              <Records />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
};

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  return (
    <BackendWakeup>
      <GoogleOAuthProvider clientId={googleClientId}>
        <AuthProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </BackendWakeup>
  );
}

export default App;
