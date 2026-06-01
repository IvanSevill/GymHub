import React, { createContext, useContext, useState, useCallback } from "react";
import { ExerciseMedia, exerciseService } from "../services/exercise";
import type { MaxLift } from "../services/analytics";

export interface ExerciseModalInfo {
  id: string;
  name: string;
  muscleName?: string;
  pr?: MaxLift;
}

export type MediaState = "loading" | "success" | "empty" | "error";

interface ExerciseModalContextValue {
  openExerciseModal: (info: ExerciseModalInfo) => void;
  closeModal: () => void;
  retryMedia: () => void;
  modalInfo: ExerciseModalInfo | null;
  media: ExerciseMedia | null;
  mediaState: MediaState;
}

const ExerciseModalContext = createContext<ExerciseModalContextValue>({
  openExerciseModal: () => {},
  closeModal: () => {},
  retryMedia: () => {},
  modalInfo: null,
  media: null,
  mediaState: "loading",
});

const mediaCache = new Map<string, ExerciseMedia>();

export const ExerciseModalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [modalInfo, setModalInfo] = useState<ExerciseModalInfo | null>(null);
  const [media, setMedia] = useState<ExerciseMedia | null>(null);
  const [mediaState, setMediaState] = useState<MediaState>("loading");

  const fetchMedia = useCallback(async (info: ExerciseModalInfo) => {
    setMediaState("loading");
    setMedia(null);
    try {
      const m = await exerciseService.getExerciseMedia(info.id);
      const hasContent = m.video_url_1 || m.video_url_2 || m.image_url;
      mediaCache.set(info.id, m);
      setMedia(m);
      setMediaState(hasContent ? "success" : "empty");
    } catch {
      setMediaState("error");
    }
  }, []);

  const openExerciseModal = useCallback(
    async (info: ExerciseModalInfo) => {
      setModalInfo(info);

      if (mediaCache.has(info.id)) {
        const cached = mediaCache.get(info.id)!;
        const hasContent =
          cached.video_url_1 || cached.video_url_2 || cached.image_url;
        setMedia(cached);
        setMediaState(hasContent ? "success" : "empty");
        return;
      }

      fetchMedia(info);
    },
    [fetchMedia],
  );

  const retryMedia = useCallback(() => {
    if (!modalInfo) return;
    mediaCache.delete(modalInfo.id);
    fetchMedia(modalInfo);
  }, [modalInfo, fetchMedia]);

  const closeModal = useCallback(() => {
    setModalInfo(null);
    setMedia(null);
  }, []);

  return (
    <ExerciseModalContext.Provider
      value={{
        openExerciseModal,
        closeModal,
        retryMedia,
        modalInfo,
        media,
        mediaState,
      }}
    >
      {children}
    </ExerciseModalContext.Provider>
  );
};

export const useExerciseModal = () => useContext(ExerciseModalContext);
