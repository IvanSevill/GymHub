import React, { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import {
  feedbackService,
  FeedbackResponse,
} from "../../services/feedbackService";

const Stars: React.FC<{ rating: number | null }> = ({ rating }) => {
  if (rating == null) return <span className="text-slate-600 text-xs">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={11}
          className={
            n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-700"
          }
        />
      ))}
    </div>
  );
};

type State = "loading" | "success" | "empty" | "error";

const FeedbackPanel: React.FC = () => {
  const [items, setItems] = useState<FeedbackResponse[]>([]);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    feedbackService
      .getAll()
      .then((data) => {
        setItems(data);
        setState(data.length === 0 ? "empty" : "success");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "loading") {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-slate-500" size={20} />
      </div>
    );
  }

  if (state === "error") {
    return (
      <p className="text-center text-slate-500 py-10 text-sm">
        Error al cargar el feedback.
      </p>
    );
  }

  if (state === "empty") {
    return (
      <p className="text-center text-slate-500 py-10 text-sm">
        Aún no hay feedback de usuarios.
      </p>
    );
  }

  return (
    <div className="divide-y divide-white/5">
      {items.map((item) => (
        <div key={item.id} className="py-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-black text-white truncate">
                {item.user_name || "Sin nombre"}
              </span>
              <span className="text-[10px] text-slate-500 truncate hidden sm:block">
                {item.user_email}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Stars rating={item.rating} />
              <span className="text-[9px] text-slate-600 whitespace-nowrap">
                {new Date(item.created_at).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {item.message}
          </p>
        </div>
      ))}
    </div>
  );
};

export default FeedbackPanel;
