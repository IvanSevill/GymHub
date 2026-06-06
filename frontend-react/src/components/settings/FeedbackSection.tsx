import React, { useState } from "react";
import { Loader2, MessageSquare, Star } from "lucide-react";
import { feedbackService } from "../../services/feedbackService";
import { useToast } from "../../context/ToastContext";

const FeedbackSection: React.FC = () => {
  const { addToast } = useToast();

  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (message.trim().length < 5) {
      addToast("El mensaje debe tener al menos 5 caracteres", "error");
      return;
    }
    setSending(true);
    try {
      await feedbackService.submit({
        message: message.trim(),
        ...(rating != null ? { rating } : {}),
      });
      setSent(true);
      setMessage("");
      setRating(null);
      addToast("¡Gracias por tu feedback!", "success");
    } catch {
      addToast("Error al enviar el feedback", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="glass-card p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-secondary/10 text-secondary rounded-xl flex items-center justify-center border border-secondary/20 shrink-0">
          <MessageSquare size={18} />
        </div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-tighter">
            Enviar feedback
          </h3>
          <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
            Sugerencias, errores o mejoras que quieras comunicar
          </p>
        </div>
      </div>

      {sent ? (
        <div className="py-6 text-center">
          <p className="text-white font-black text-base mb-1">
            ¡Gracias por tu mensaje!
          </p>
          <p className="text-slate-500 text-sm mb-4">
            Tu feedback ayuda a mejorar GymHub.
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-wider transition-colors"
          >
            Enviar otro
          </button>
        </div>
      ) : (
        <>
          {/* Star rating */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Valoración (opcional)
            </p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setRating(rating === n ? null : n)}
                  className="transition-transform hover:scale-110"
                  aria-label={`${n} estrellas`}
                >
                  <Star
                    size={20}
                    className={
                      n <= (hovered ?? rating ?? 0)
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-700"
                    }
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Mensaje *
            </p>
            <textarea
              rows={4}
              placeholder="Escribe tu sugerencia o comentario…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input-field resize-none text-sm py-3 px-4 leading-relaxed"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={sending || message.trim().length < 5}
            className="self-end flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-secondary/90 transition-all disabled:opacity-40"
          >
            {sending && <Loader2 size={12} className="animate-spin" />}
            Enviar feedback
          </button>
        </>
      )}
    </section>
  );
};

export default FeedbackSection;
