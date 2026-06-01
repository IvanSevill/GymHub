import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Dumbbell, Play, Trophy, Video, X } from "lucide-react";
import { useExerciseModal } from "../context/ExerciseModalContext";
import { SkeletonBlock } from "./ui/Skeleton";

const MEASUREMENT_LABELS: Record<string, string> = {
  kg: "kg",
  reps: "reps",
  s: "seg",
  min: "min",
};

const ExerciseModal: React.FC = () => {
  const { modalInfo, media, mediaState, retryMedia, closeModal } =
    useExerciseModal();

  useEffect(() => {
    if (!modalInfo) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalInfo, closeModal]);

  const videos =
    mediaState === "success"
      ? [media?.video_url_1, media?.video_url_2].filter(Boolean)
      : [];

  return (
    <AnimatePresence>
      {modalInfo && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/75 z-50 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Modal card */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
          >
            <div
              className="glass-card w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Title bar */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
                <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/15 shrink-0">
                  <Dumbbell size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white capitalize tracking-tight truncate">
                    {modalInfo.name}
                  </p>
                  {modalInfo.muscleName && (
                    <p className="text-[10px] text-slate-500 capitalize mt-0.5">
                      {modalInfo.muscleName}
                    </p>
                  )}
                </div>
                {modalInfo.pr && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Trophy size={12} className="text-primary" />
                    <span className="text-sm font-black text-white tabular-nums">
                      {modalInfo.pr.max_value}
                      <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                        {MEASUREMENT_LABELS[modalInfo.pr.measurement] ??
                          modalInfo.pr.measurement}
                      </span>
                    </span>
                  </div>
                )}
                <button
                  onClick={closeModal}
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all shrink-0 ml-1"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Media */}
              <div className="p-5">
                {mediaState === "loading" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SkeletonBlock className="h-48 rounded-2xl" />
                    <SkeletonBlock className="h-48 rounded-2xl" />
                  </div>
                ) : mediaState === "error" ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <AlertCircle size={28} className="text-red-500/60" />
                    <p className="text-sm text-slate-500">
                      Error al cargar los recursos multimedia
                    </p>
                    <button
                      onClick={retryMedia}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : mediaState === "empty" ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <Video size={28} className="text-slate-700" />
                    <p className="text-sm text-slate-500">
                      No hay media disponible para este ejercicio
                    </p>
                    <p className="text-[10px] text-slate-600 max-w-xs">
                      Configura{" "}
                      <span className="font-mono text-slate-500">
                        YOUTUBE_API_KEY
                      </span>{" "}
                      y{" "}
                      <span className="font-mono text-slate-500">
                        GOOGLE_SEARCH_API_KEY
                      </span>{" "}
                      en el backend para activar esta función.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:h-72">
                    {media?.image_url && (
                      <div className="relative rounded-2xl overflow-hidden border border-white/8 bg-black flex items-center justify-center h-52 sm:h-full">
                        {/* Blurred background */}
                        <img
                          src={media.image_url}
                          alt=""
                          aria-hidden
                          className="absolute inset-0 w-full h-full object-cover scale-110 blur-lg opacity-60"
                        />
                        {/* Main image with vignette edges */}
                        <img
                          src={media.image_url}
                          alt={modalInfo.name}
                          className="relative z-10 w-full h-full object-cover"
                          style={{
                            maskImage:
                              "radial-gradient(ellipse 85% 85% at 50% 50%, black 40%, transparent 100%)",
                            WebkitMaskImage:
                              "radial-gradient(ellipse 85% 85% at 50% 50%, black 40%, transparent 100%)",
                          }}
                          onError={(e) => {
                            const el = e.currentTarget as HTMLImageElement;
                            el.parentElement!.style.display = "none";
                          }}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-3 sm:h-full">
                      {videos.map((url, vi) => {
                        const videoId = url?.split("v=")[1]?.split("&")[0];
                        return videoId ? (
                          <div
                            key={vi}
                            className="sm:flex-1 rounded-2xl overflow-hidden border border-white/8"
                          >
                            <iframe
                              src={`https://www.youtube.com/embed/${videoId}`}
                              title={`${modalInfo.name} video ${vi + 1}`}
                              className="w-full h-44 sm:h-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        ) : (
                          <a
                            key={vi}
                            href={url!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/8 hover:border-primary/30 transition-all group"
                          >
                            <Play size={16} className="text-primary shrink-0" />
                            <span className="text-xs text-slate-400 group-hover:text-white transition-colors">
                              Ver video {vi + 1} en YouTube
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ExerciseModal;
