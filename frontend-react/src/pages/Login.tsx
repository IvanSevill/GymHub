import React, { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authService } from "../services/auth";
import { Dumbbell, Loader2, ShieldCheck, Zap, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleLogin = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      setIsLoggingIn(true);
      setError(null);
      try {
        const { access_token, user } = await authService.loginWithGoogle(
          codeResponse.code,
        );
        login(access_token, user);
        navigate("/");
      } catch (err: any) {
        console.error("Login failed:", err);
        setError(
          err.response?.data?.detail ||
            "Error al autenticar con Google. Revisa tu conexión.",
        );
      } finally {
        setIsLoggingIn(false);
      }
    },
    onError: (error) => {
      console.error("Google Login Error:", error);
      setError("Error en el inicio de sesión de Google. Inténtalo de nuevo.");
    },
    flow: "auth-code",
    scope: "openid email profile https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
    onNonOAuthError: (error) => console.error("Non-OAuth Error:", error),
  });

  const features = [
    { icon: <Zap size={14} />, text: "Sync con Google Calendar" },
    { icon: <BarChart3 size={14} />, text: "Analíticas en Tiempo Real" },
    { icon: <ShieldCheck size={14} />, text: "Integración con Fitbit" },
  ];

  return (
    <div className="flex items-center justify-center min-h-screen bg-background dot-pattern px-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 blur-[150px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-10 md:p-14 w-full max-w-lg relative z-10 border-white/5 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-12">
          <div className="w-20 h-20 bg-primary rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-primary/30 rotate-3 hover:rotate-0 transition-transform duration-500">
            <Dumbbell className="text-white w-10 h-10" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter mb-4">
            Gym<span className="text-primary">Hub</span>
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] text-center">
            Inteligencia de entrenamiento avanzada
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-8 p-4 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-[10px] font-black uppercase tracking-widest text-center"
          >
            {error}
          </motion.div>
        )}

        <div className="space-y-4">
          <button
            onClick={() => googleLogin()}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-4 bg-white text-black py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50 group"
          >
            {isLoggingIn ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
                className="w-5 h-5 group-hover:scale-110 transition-transform"
              />
            )}
            {isLoggingIn ? "Iniciando Sesión..." : "Entrar con Google"}
          </button>
        </div>

        <div className="mt-12 pt-10 border-t border-white/5">
          <div className="flex flex-col gap-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-slate-500">
                <div className="text-primary">{f.icon}</div>
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {f.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="absolute bottom-8 flex flex-col items-center gap-2 pointer-events-none">
        <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em]">
          Protocolo v2.0 • 2026
        </span>
        <div className="flex gap-4 pointer-events-auto">
          <a
            href="/privacy"
            className="text-[9px] font-bold text-slate-600 uppercase tracking-widest hover:text-slate-400 transition-colors"
          >
            Privacy Policy
          </a>
          <span className="text-slate-700 text-[9px]">•</span>
          <a
            href="/terms"
            className="text-[9px] font-bold text-slate-600 uppercase tracking-widest hover:text-slate-400 transition-colors"
          >
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;
