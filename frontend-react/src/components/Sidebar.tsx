import React from "react";
import { NavLink } from "react-router-dom";
import {
  Dumbbell,
  Calendar as CalendarIcon,
  BarChart2,
  Settings,
  X,
  Heart,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { to: "/", icon: <BarChart2 size={18} />, label: "Análisis" },
  { to: "/calendar", icon: <CalendarIcon size={18} />, label: "Calendario" },
  { to: "/workouts", icon: <History size={18} />, label: "Historial" },
  { to: "/ejercicios", icon: <Dumbbell size={18} />, label: "Ejercicios" },
  { to: "/salud", icon: <Heart size={18} />, label: "Salud" },
];

const SidebarContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();

  return (
    <div
      className="w-64 h-screen flex flex-col"
      style={{
        background: "rgba(8, 12, 20, 0.85)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Logo */}
      <div className="px-6 pt-8 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(249,115,22,0.15)",
              border: "1px solid rgba(249,115,22,0.3)",
            }}
          >
            <Dumbbell size={17} className="text-primary" />
          </div>
          <span className="text-[15px] font-black tracking-tight text-white">
            Gym<span className="text-primary">Hub</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="md:hidden text-slate-600 hover:text-slate-300 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Divider */}
      <div className="mx-6 h-px bg-white/5 mb-4" />

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 text-sm font-semibold group ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-slate-600 group-hover:text-slate-300"
                  }`}
                >
                  {item.icon}
                </div>
                <span className="tracking-tight">{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User card */}
      <div className="p-4 mt-auto">
        <div className="h-px bg-white/5 mb-4" />
        <NavLink
          to="/settings"
          onClick={onClose}
          className={({ isActive }) =>
            `flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 group ${
              isActive
                ? "bg-primary/8 border border-primary/15"
                : "hover:bg-white/[0.04] border border-transparent"
            }`
          }
        >
          {user?.picture_url ? (
            <img
              src={user.picture_url}
              alt={user.name}
              className="w-9 h-9 rounded-xl border border-white/10 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center font-black text-sm shrink-0">
              {user?.name?.charAt(0) || "U"}
            </div>
          )}
          <div className="overflow-hidden flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">
              {user?.name}
            </p>
            <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
          </div>
          <Settings
            size={13}
            className="text-slate-600 group-hover:text-primary transition-colors shrink-0"
          />
        </NavLink>
      </div>
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:block fixed left-0 top-0 z-50">
        <SidebarContent onClose={onClose} />
      </div>

      {/* Mobile: drawer with backdrop */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 z-40 md:hidden"
              onClick={onClose}
            />
            <motion.div
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 z-50 md:hidden"
            >
              <SidebarContent onClose={onClose} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
