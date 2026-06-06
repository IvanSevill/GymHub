import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  BarChart2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Heart,
  History,
  Settings,
  X,
  Zap,
} from "lucide-react";

const STORAGE_KEY = "gymhub_onboarding_v1";

interface Step {
  route: string;
  icon: React.ReactNode;
  label: string;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    route: "/",
    icon: <Activity size={18} className="text-primary" />,
    label: "Inicio",
    title: "¡Bienvenido a GymHub!",
    description:
      "Este tutorial te guiará por las secciones principales. Pulsa Siguiente o los tabs para navegar.",
  },
  {
    route: "/",
    icon: <BarChart2 size={18} className="text-secondary" />,
    label: "Análisis",
    title: "Dashboard de Analíticas",
    description:
      "KPIs del período: entrenamientos, volumen, duración y récords. Los gráficos muestran frecuencia semanal, volumen por sesión y progreso de cargas.",
  },
  {
    route: "/calendar",
    icon: <Calendar size={18} className="text-primary" />,
    label: "Calendario",
    title: "Calendario de Entrenamiento",
    description:
      "Sincroniza con Google Calendar. Usa ↺ para sincronizar, + para crear eventos futuros y ↑ para subir cardio de Fitbit a Calendar.",
  },
  {
    route: "/workouts",
    icon: <History size={18} className="text-slate-300" />,
    label: "Historial",
    title: "Historial de Entrenamientos",
    description:
      "Todos tus entrenos, pasados y futuros. Filtra por músculo o por datos Fitbit. Pulsa cualquier ejercicio para abrir su ficha multimedia.",
  },
  {
    route: "/ejercicios",
    icon: <Dumbbell size={18} className="text-primary" />,
    label: "Ejercicios",
    title: "Biblioteca de Ejercicios",
    description:
      "Ejercicios organizados por músculo con tus récords personales. Pulsa cualquier card para ver vídeos de YouTube e imágenes de referencia.",
  },
  {
    route: "/salud",
    icon: <Heart size={18} className="text-red-400" />,
    label: "Salud",
    title: "Métricas de Salud Fitbit",
    description:
      "Conecta tu Fitbit desde Ajustes para ver pasos, frecuencia cardíaca, sueño, calorías y zonas activas en un único panel.",
  },
  {
    route: "/settings",
    icon: <Settings size={18} className="text-slate-300" />,
    label: "Perfil",
    title: "Completa tu perfil",
    description:
      "Añade tu altura en Ajustes para que GymChat pueda darte recomendaciones más precisas sobre cargas y progreso. Es opcional — puedes saltarte este paso.",
  },
  {
    route: "/",
    icon: <Zap size={18} className="text-primary" />,
    label: "¡Listo!",
    title: "¡Ya conoces GymHub!",
    description:
      "Empieza conectando Google Calendar y Fitbit desde Ajustes. El tutorial está siempre disponible allí si lo necesitas.",
  },
];

const OnboardingTutorial: React.FC = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(STORAGE_KEY),
  );
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!visible) return;
    navigate(steps[step].route);
  }, [step, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const next = () =>
    step === steps.length - 1 ? dismiss() : setStep((s) => s + 1);
  const prev = () => step > 0 && setStep((s) => s - 1);

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="onboarding"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-0 sm:bottom-6 left-0 sm:left-1/2 z-[200] w-full sm:w-[calc(100%-2rem)] sm:max-w-lg"
          style={{ transform: "translateX(0)" }}
        >
          {/* Outer wrapper handles the sm:translate */}
          <div className="sm:translate-x-0">
            <div
              className="border-t sm:border border-white/10 shadow-2xl sm:rounded-3xl overflow-hidden"
              style={{
                background: "rgba(8, 12, 20, 0.97)",
                backdropFilter: "blur(32px)",
                WebkitBackdropFilter: "blur(32px)",
              }}
            >
              {/* ── Desktop: tab bar ── */}
              <div className="hidden sm:flex items-center border-b border-white/[0.06] overflow-x-auto no-scrollbar px-2 pt-2">
                {steps.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${
                      i === step
                        ? "bg-primary/10 text-primary border-b-2 border-primary"
                        : "text-slate-600 hover:text-slate-400"
                    }`}
                  >
                    {s.icon}
                    <span>{s.label}</span>
                  </button>
                ))}
                <button
                  onClick={dismiss}
                  className="ml-auto shrink-0 w-7 h-7 flex items-center justify-center rounded-xl text-slate-600 hover:text-white hover:bg-white/10 transition-all mr-2 mb-1"
                >
                  <X size={13} />
                </button>
              </div>

              {/* ── Mobile: compact header ── */}
              <div className="flex sm:hidden items-center gap-3 px-4 pt-4 pb-2">
                <div className="w-7 h-7 bg-white/5 rounded-xl flex items-center justify-center shrink-0">
                  {current.icon}
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex-1">
                  {step + 1} / {steps.length} — {current.label}
                </span>
                <button
                  onClick={dismiss}
                  className="w-7 h-7 flex items-center justify-center rounded-xl text-slate-600 hover:text-white hover:bg-white/10 transition-all"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Content */}
              <div className="px-4 sm:px-5 py-3 sm:py-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="space-y-1"
                  >
                    <p className="text-sm font-black text-white tracking-tight">
                      {current.title}
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {current.description}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 flex items-center justify-between gap-3">
                {/* Progress dots */}
                <div className="flex gap-1">
                  {steps.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setStep(i)}
                      className="h-1.5 rounded-full transition-all duration-300"
                      style={{
                        width: i === step ? "18px" : "6px",
                        background:
                          i === step
                            ? "rgb(249,115,22)"
                            : i < step
                              ? "rgba(249,115,22,0.3)"
                              : "rgba(255,255,255,0.1)",
                      }}
                    />
                  ))}
                </div>

                {/* Buttons */}
                <div className="flex gap-2 shrink-0">
                  {step > 0 && (
                    <button
                      onClick={prev}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                    >
                      <ChevronLeft size={13} />
                      <span className="hidden sm:inline">Atrás</span>
                    </button>
                  )}
                  <button
                    onClick={next}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white transition-all"
                    style={{ background: "rgba(249,115,22,0.9)" }}
                  >
                    {isLast ? "¡Empezar!" : "Siguiente"}
                    {!isLast && <ChevronRight size={13} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingTutorial;
