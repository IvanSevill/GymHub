import React from "react";
import { Loader2 } from "lucide-react";

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmIcon: React.ReactNode;
  variant?: "primary" | "danger";
  isLoading: boolean;
}

const ModalFooter: React.FC<Props> = ({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmIcon,
  variant = "primary",
  isLoading,
}) => {
  const confirmCls =
    variant === "danger"
      ? "flex-1 py-3 rounded-2xl bg-danger text-white font-black text-[10px] uppercase tracking-widest hover:bg-danger/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
      : "flex-1 py-3 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40";

  return (
    <div className="flex gap-2">
      <button
        onClick={onCancel}
        disabled={isLoading}
        className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
      >
        Cancelar
      </button>
      <button onClick={onConfirm} disabled={isLoading} className={confirmCls}>
        {isLoading ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          confirmIcon
        )}
        {confirmLabel}
      </button>
    </div>
  );
};

export default ModalFooter;
