import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Menu, Dumbbell, MessageCircle } from "lucide-react";
import { NavLink } from "react-router-dom";
import Sidebar from "./Sidebar";
import ToastContainer from "./ui/ToastContainer";
import ExerciseModal from "./ExerciseModal";
import OnboardingTutorial from "./OnboardingTutorial";
import ChatPanel from "./chat/ChatPanel";
import { ExerciseModalProvider } from "../context/ExerciseModalContext";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";

const AI_HEALTH_URL = `${import.meta.env.VITE_AI_URL ?? "http://localhost:8001"}/health`;

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [aiHealthy, setAiHealthy] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(AI_HEALTH_URL, {
          signal: AbortSignal.timeout(5000),
        });
        if (!cancelled) setAiHealthy(res.ok);
      } catch {
        if (!cancelled) setAiHealthy(false);
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <ExerciseModalProvider>
      <div className="flex min-h-screen bg-background dot-pattern selection:bg-primary/30 selection:text-white">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 md:ml-64 relative z-10 overflow-x-hidden">
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center justify-between px-5 py-4 border-b border-white/5 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-slate-400 hover:text-white transition-colors p-1"
              aria-label="Abrir menú"
            >
              <Menu size={22} />
            </button>
            <h1 className="text-lg font-black tracking-tighter text-white flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
                <Dumbbell size={13} />
              </div>
              Gym<span className="text-primary">Hub</span>
            </h1>
            <NavLink to="/settings" className="shrink-0">
              {user?.picture_url ? (
                <img
                  src={user.picture_url}
                  alt={user?.name}
                  className="w-8 h-8 rounded-lg border border-white/10"
                />
              ) : (
                <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center font-black text-sm">
                  {user?.name?.charAt(0) || "U"}
                </div>
              )}
            </NavLink>
          </div>

          <div className="p-5 md:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Visual Accents */}
        <div className="fixed top-[-10%] right-[-5%] w-[600px] h-[600px] bg-primary/[0.04] blur-[140px] rounded-full -z-10 pointer-events-none" />
        <div className="fixed bottom-[-10%] left-[15%] w-[400px] h-[400px] bg-accent/[0.04] blur-[120px] rounded-full -z-10 pointer-events-none" />
        <div className="fixed top-[40%] left-[30%] w-[300px] h-[300px] bg-secondary/[0.03] blur-[100px] rounded-full -z-10 pointer-events-none" />

        <ToastContainer />
        <ExerciseModal />
        <OnboardingTutorial />

        {/* AI Chat FAB — hidden when ai-server is unreachable */}
        {aiHealthy && (
          <button
            onClick={() => setChatOpen(true)}
            className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-primary rounded-2xl shadow-lg shadow-primary/30 flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform md:bottom-8 md:right-8"
            aria-label="Abrir asistente IA"
          >
            <MessageCircle size={20} />
          </button>
        )}
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      </div>
    </ExerciseModalProvider>
  );
};

export default Layout;
