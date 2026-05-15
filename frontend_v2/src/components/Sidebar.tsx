import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Dumbbell,
  Calendar as CalendarIcon,
  BarChart2,
  Settings,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const Sidebar: React.FC = () => {
  const { user } = useAuth();

  const navItems = [
    { to: "/", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
    { to: "/calendar", icon: <CalendarIcon size={18} />, label: "Calendario" },
    { to: "/workouts", icon: <Dumbbell size={18} />, label: "Entrenamientos" },
    { to: "/analytics", icon: <BarChart2 size={18} />, label: "Análisis" },
    { to: "/parser-test", icon: <Settings size={18} />, label: "Test Parser" },
    { to: "/standardize", icon: <Settings size={18} />, label: "Estandarizar" },
  ];

  return (
    <div className="w-64 bg-background border-r border-white/5 text-white h-screen flex flex-col fixed left-0 top-0 z-50">
      <div className="p-8">
        <h1 className="text-2xl font-black tracking-tighter text-white flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <Dumbbell size={18} />
          </div>
          Gym<span className="text-primary">Hub</span>
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 font-bold text-sm uppercase tracking-widest ${
                isActive
                  ? "bg-primary text-white shadow-xl shadow-primary/20"
                  : "text-slate-500 hover:text-white hover:bg-white/5"
              }`
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-6 mt-auto border-t border-white/5 bg-black/20">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300 group ${
              isActive
                ? "bg-primary/10 border-primary/20"
                : "bg-white/5 border-white/5 hover:bg-white/10"
            }`
          }
        >
          {user?.picture_url ? (
            <img
              src={user.picture_url}
              alt={user.name}
              className="w-10 h-10 rounded-xl shadow-lg border border-white/10"
            />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center font-black">
              {user?.name?.charAt(0) || "U"}
            </div>
          )}
          <div className="overflow-hidden flex-1">
            <p className="text-xs font-black text-white truncate uppercase tracking-tighter">
              {user?.name}
            </p>
            <p className="text-[9px] text-slate-500 truncate font-bold">
              {user?.email}
            </p>
          </div>
          <Settings
            size={14}
            className="text-slate-500 group-hover:text-primary transition-colors"
          />
        </NavLink>
      </div>
    </div>
  );
};

export default Sidebar;
