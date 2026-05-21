import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToast, type ToastType } from "../../context/ToastContext";

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} className="shrink-0 text-accent" />,
  error: <AlertCircle size={18} className="shrink-0 text-danger" />,
  info: <Info size={18} className="shrink-0 text-primary" />,
};

const borderMap: Record<ToastType, string> = {
  success: "border-l-accent",
  error: "border-l-danger",
  info: "border-l-primary",
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto flex items-center gap-3 bg-surface border border-white/10 border-l-4 ${borderMap[toast.type]} rounded-2xl px-4 py-3 shadow-2xl max-w-sm`}
          >
            {iconMap[toast.type]}
            <p className="text-sm text-slate-200 font-medium flex-1">
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-500 hover:text-slate-300 transition-colors ml-1"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ToastContainer;
