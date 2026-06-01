import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  BarChart2,
  Calendar,
  ChevronRight,
  Dumbbell,
  Heart,
  History,
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
    icon: <Activity size={20} className="text-primary" />,
    label: "Bienvenida",
    title: "¡Bienvenido a GymHub!",
    description:
      "Este tutorial te guiará por las secciones principales de la app. Puedes usar los botones de abajo o navegar tú mismo — el tutorial te sigue.",
  },
  {
    route: "/",
    icon: <BarChart2 size={20} className="text-secondary" />,
    label: "Análisis",
    title: "Dashboard de Analíticas",
    description:
      "Aquí ves tus KPIs: entrenamientos, volumen total, duración media y récords del período. Los gráficos muestran frecuencia semanal, volumen por sesión y progreso de cargas por ejercicio.",
  },
  {
    route: "/calendar",
    icon: <Calendar size={20} className="text-primary" />,
    label: "Calendario",
    title: "Calendario de Entrenamiento",
    description:
      "Sincroniza con Google Calendar para ver todos tus eventos de entrenamiento. Usa el botón ↺ para sincronizar, + para añadir un evento futuro, y ↑ para subir actividades de cardio de Fitbit.",
  },
  {
    route: "/workouts",
    icon: <History size={20} className="text-slate-300" />,
    label: "Historial",
    title: "Historial de Entrenamientos",
    description:
      "Consulta todos tus entrenos pasados y futuros. Filtra por músculo o por datos de Fitbit. Haz clic en cualquier ejercicio para abrir su ficha multimedia con vídeos y fotos.",
  },
  {
    route: "/ejercicios",
    icon: <Dumbbell size={20} className="text-primary" />,
    label: "Ejercicios",
    title: "Biblioteca de Ejercicios",
    description:
      "Explora todos los ejercicios organizados por músculo con tus récords personales. Pulsa cualquier card para ver vídeos de YouTube e imágenes de referencia.",
  },
  {
    route: "/salud",
    icon: <Heart size={20} className="text-red-400" />,
    label: "Salud",
    title: "Métricas de Salud Fitbit",
    description:
      "Conecta tu Fitbit desde Ajustes para ver pasos diarios, frecuencia cardíaca, sueño, calorías y zonas activas. Todo en un único panel.",
  },
  {
    route: "/",
    icon: <Zap size={20} className="text-primary" />,
    label: "¡Listo!",
    title: "¡Ya conoces GymHub!",
    description:
      "Empieza sincronizando tu Google Calendar desde Ajustes y conectando Fitbit. Si tienes alguna duda, el tutorial estará siempre disponible en Ajustes.",
  },
];

const OnboardingTutorial: React.FC = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(STORAGE_KEY),
  );
  const [step, setStep] = useState(0);

  // Navigate to the step's route on mount and on step change
  useEffect(() => {
    if (!visible) return;
    navigate(steps[step].route);
  }, [step, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const goTo = (i: number) => setStep(i);

  const next = () => {
    if (step === steps.length - 1) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  };

  const prev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="onboarding"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 32 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 left-1/2 z-[200] w-[calc(100%-2rem)] max-w-lg"
          style={{ transform: "translateX(-50%)" }}
        >
          {/* Panel */}
          <div
            className="rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            style={{
              background: "rgba(8, 12, 20, 0.96)",
              backdropFilter: "blur(32px)",
              WebkitBackdropFilter: "blur(32px)",
            }}
          >
            {/* Step tabs */}
            <div className="flex items-center border-b border-white/[0.06] overflow-x-auto no-scrollbar px-2 pt-2">
              {steps.map((s, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${
                    i === step
                      ? "bg-primary/10 text-primary border-b-2 border-primary"
                      : "text-slate-600 hover:text-slate-400"
                  }`}
                >
                  {s.icon}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              ))}
              <button
                onClick={dismiss}
                className="ml-auto shrink-0 w-7 h-7 flex items-center justify-center rounded-xl text-slate-600 hover:text-white hover:bg-white/10 transition-all mr-2 mb-1"
              >
                <X size={13} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-1.5"
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
            <div className="px-5 pb-5 flex items-center justify-between gap-4">
              {/* Progress */}
              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className="h-1 rounded-full transition-all duration-300"
                    style={{
                      width: i === step ? "20px" : "6px",
                      background:
                        i === step
                          ? "rgb(249,115,22)"
                          : i < step
                            ? "rgba(249,115,22,0.35)"
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
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                  >
                    Atrás
                  </button>
                )}
                <button
                  onClick={next}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black text-white transition-all"
                  style={{ background: "rgba(249,115,22,0.9)" }}
                >
                  {isLast ? "¡Empezar!" : "Siguiente"}
                  {!isLast && <ChevronRight size={13} />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingTutorial;
