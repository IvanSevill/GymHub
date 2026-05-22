import React, { useEffect, useRef, useState } from "react";
import { Activity, Loader2 } from "lucide-react";

const HEALTH_URL = `${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/health`;

const BackendWakeup: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [ready, setReady] = useState(false);
  const [showScreen, setShowScreen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval>;
    let showTimer: ReturnType<typeof setTimeout>;
    let elapsedTimer: ReturnType<typeof setInterval>;

    const check = async () => {
      try {
        const res = await fetch(HEALTH_URL, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok && !cancelled) {
          clearInterval(poll);
          clearTimeout(showTimer);
          clearInterval(elapsedTimer);
          setReady(true);
        }
      } catch {
        // backend still waking up
      }
    };

    check();
    poll = setInterval(check, 3000);

    showTimer = setTimeout(() => {
      if (!cancelled) {
        setShowScreen(true);
        elapsedTimer = setInterval(
          () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
          1000,
        );
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearTimeout(showTimer);
      clearInterval(elapsedTimer);
    };
  }, []);

  if (ready) return <>{children}</>;

  if (!showScreen) {
    return <div className="min-h-screen bg-neutral-950" />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Activity size={20} className="text-primary" />
        </div>
        <span className="text-white font-black text-2xl tracking-tight uppercase">
          GymHub
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 text-center max-w-xs">
        <Loader2 size={28} className="text-primary animate-spin" />
        <p className="text-white font-bold text-sm tracking-wide">
          Iniciando servidor…
        </p>
        <p className="text-slate-500 text-xs leading-relaxed">
          El servidor está en reposo. El arranque puede tardar hasta 60 segundos
          en Render (plan gratuito).
        </p>
      </div>

      <div className="flex flex-col items-center gap-1 mt-2">
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
        <span className="text-slate-600 text-[10px] font-mono mt-2">
          {elapsed}s
        </span>
      </div>
    </div>
  );
};

export default BackendWakeup;
