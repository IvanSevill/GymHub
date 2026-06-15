import React, { type ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Brain,
  Check,
  Loader2,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  type ChatMemoryItem,
  type ChatMessage,
  type ChatUsage,
  deleteMemoryItem,
  getHistory,
  getMemories,
  getUsage,
  saveMemoryItem,
  streamChat,
} from "../../services/chat";
import { SkeletonBlock } from "../ui/Skeleton";

const AI_HEALTH_URL = `${import.meta.env.VITE_AI_URL ?? "http://localhost:8001"}/health`;

const HEALTH_POLL_INTERVAL_MS = 3000;
const WAKEUP_SHOW_DELAY_MS = 1500;
const HEALTH_CHECK_TIMEOUT_MS = 5000;

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  "¿Cuántos entrenos hice este mes?",
  "¿Cuál es mi récord en press banca?",
  "Sube los cardios pendientes de Fitbit",
  "¿Qué músculos tengo descuidados?",
];

const ThinkingDots: React.FC = () => (
  <div className="mr-auto max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-sm bg-white/5 border border-white/8 flex items-center gap-1.5">
    <span
      className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
      style={{ animationDelay: "0ms" }}
    />
    <span
      className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
      style={{ animationDelay: "150ms" }}
    />
    <span
      className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
      style={{ animationDelay: "300ms" }}
    />
  </div>
);

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const AssistantBubble: React.FC<{ content: string; cursor?: boolean }> = ({
  content,
  cursor = false,
}) => (
  <div className="mr-auto max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-white/5 border border-white/8 text-slate-200 text-sm">
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }: { children?: ReactNode }) => (
            <div className="overflow-x-auto my-2">
              <table className="text-xs border-collapse w-full">
                {children}
              </table>
            </div>
          ),
          th: ({ children }: { children?: ReactNode }) => (
            <th className="border border-white/20 px-2 py-1 text-left font-semibold bg-white/10">
              {children}
            </th>
          ),
          td: ({ children }: { children?: ReactNode }) => (
            <td className="border border-white/20 px-2 py-1">{children}</td>
          ),
          p: ({ children }: { children?: ReactNode }) => (
            <p className="mb-1 last:mb-0">{children}</p>
          ),
          strong: ({ children }: { children?: ReactNode }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          code: ({ children }: { children?: ReactNode }) => (
            <code className="bg-white/10 rounded px-1 py-0.5 text-xs font-mono">
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
    {cursor && <span className="animate-pulse">▋</span>}
  </div>
);

const ChatPanel: React.FC<ChatPanelProps> = ({ open, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [memories, setMemories] = useState<ChatMemoryItem[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [memFormOpen, setMemFormOpen] = useState(false);
  const [memFormKey, setMemFormKey] = useState("");
  const [memFormValue, setMemFormValue] = useState("");
  const [memFormSaving, setMemFormSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasLoadedHistoryRef = useRef(false);

  // ai-server wakeup (Render cold-start can take up to 60s)
  const [aiReady, setAiReady] = useState(false);
  const [aiWaking, setAiWaking] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const aiReadyRef = useRef(false);
  const aiStartRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setAiReady(false);
      setAiWaking(false);
      setAiElapsed(0);
      aiReadyRef.current = false;
      // Messages and usage persist across open/close
      return;
    }

    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout>;
    let elapsedTimer: ReturnType<typeof setInterval>;
    aiStartRef.current = Date.now();

    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout>;

    const scheduleCheck = () => {
      retryTimer = setTimeout(doCheck, retryDelay);
      retryDelay = Math.min(retryDelay * 2, HEALTH_POLL_INTERVAL_MS);
    };

    const doCheck = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(AI_HEALTH_URL, {
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
        });
        if (res.ok && !cancelled) {
          clearTimeout(showTimer);
          clearInterval(elapsedTimer);
          aiReadyRef.current = true;
          setAiReady(true);
          setAiWaking(false);
          return;
        }
      } catch {
        // still waking up
      }
      scheduleCheck();
    };

    doCheck();

    showTimer = setTimeout(() => {
      if (!cancelled && !aiReadyRef.current) {
        setAiWaking(true);
        elapsedTimer = setInterval(
          () =>
            setAiElapsed(Math.floor((Date.now() - aiStartRef.current) / 1000)),
          1000,
        );
      }
    }, WAKEUP_SHOW_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearTimeout(showTimer);
      clearInterval(elapsedTimer);
    };
  }, [open]);

  // Load history and usage once (on first ready), then never auto-reload
  useEffect(() => {
    if (!open || !aiReady || hasLoadedHistoryRef.current) return;
    hasLoadedHistoryRef.current = true;
    setLoadingHistory(true);
    getHistory().then((history) => {
      if (history.length > 0) setMessages(history);
      setLoadingHistory(false);
    });
    getUsage().then(setUsage);
    getMemories().then(setMemories);
  }, [open, aiReady]);

  // Countdown ticker — updates every second
  useEffect(() => {
    if (!usage?.reset_at) {
      setTimeLeft(0);
      return;
    }
    const tick = () => {
      setTimeLeft(
        Math.max(0, new Date(usage.reset_at!).getTime() - Date.now()),
      );
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [usage?.reset_at]);

  // Auto-scroll to bottom whenever messages or streaming content changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, thinking]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [open]);

  const refreshUsage = () => {
    getUsage().then(setUsage);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setStreaming(true);
    setThinking(false);
    setStreamingContent("");
    setErrorMessage(null);

    let accumulated = "";

    try {
      const generator = streamChat(nextMessages);
      for await (const event of generator) {
        if (event.type === "thinking") {
          setThinking(true);
        } else if (event.type === "text") {
          setThinking(false);
          accumulated += event.text ?? "";
          setStreamingContent(accumulated);
        } else if (event.type === "done") {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: accumulated },
          ]);
          setStreamingContent("");
          setStreaming(false);
          setThinking(false);
          refreshUsage();
          getMemories().then(setMemories);
          break;
        } else if (event.type === "error") {
          setErrorMessage(event.message ?? "Error desconocido");
          setStreamingContent("");
          setStreaming(false);
          setThinking(false);
          refreshUsage();
          break;
        }
      }
    } catch {
      setErrorMessage("No se pudo conectar con el asistente IA.");
      setStreamingContent("");
      setStreaming(false);
      setThinking(false);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    setInput(el.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleClearHistory = () => {
    setMessages([]);
    setErrorMessage(null);
    setStreamingContent("");
    hasLoadedHistoryRef.current = false;
  };

  const rateLimitReached =
    !usage?.is_root && usage !== null && usage.used >= usage.limit;
  const isEmpty = messages.length === 0 && !streaming && !errorMessage;
  const isInputBlocked = streaming || !aiReady || rateLimitReached;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            key="chat-overlay"
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Chat panel */}
          <motion.div
            key="chat-panel"
            className="fixed right-0 top-0 h-full w-full sm:w-[420px] z-50 flex flex-col"
            style={{
              background: "rgba(15, 23, 41, 0.95)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderLeft: "1px solid rgba(255, 255, 255, 0.06)",
              boxShadow: "-8px 0 48px rgba(0, 0, 0, 0.5)",
            }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            {/* Header */}
            <div className="p-4 border-b border-white/8 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/20 border border-primary/30 rounded-xl flex items-center justify-center">
                  <Bot size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm leading-none">
                    GymChat
                  </p>
                  {usage?.is_root ? (
                    <span className="text-xs text-emerald-400 font-medium">
                      Sin límite
                    </span>
                  ) : usage ? (
                    <p
                      className={`text-xs mt-0.5 ${
                        usage.used >= usage.limit
                          ? "text-red-400"
                          : usage.used >= usage.limit - 1
                            ? "text-amber-400"
                            : "text-slate-500"
                      }`}
                    >
                      <span className="text-xs text-white/50">
                        {`${usage.used}/${usage.limit} · ${formatCountdown(timeLeft)}`}
                      </span>
                    </p>
                  ) : (
                    <p className="text-slate-500 text-xs mt-0.5">
                      Asistente de fitness
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {aiReady && (
                  <button
                    onClick={() => setMemoryOpen((v) => !v)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      memoryOpen
                        ? "text-primary bg-primary/15"
                        : "text-slate-500 hover:text-primary hover:bg-white/8"
                    }`}
                    aria-label="Memoria del asistente"
                    title="Memoria"
                  >
                    <Brain size={15} />
                  </button>
                )}
                {messages.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-white/8 transition-colors"
                    aria-label="Borrar historial"
                    title="Borrar historial"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
                  aria-label="Cerrar asistente"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Memory panel */}
            <AnimatePresence>
              {memoryOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-b border-white/8"
                >
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Memoria
                      </p>
                      <button
                        onClick={() => {
                          setMemFormKey("");
                          setMemFormValue("");
                          setMemFormOpen((v) => !v);
                        }}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        <Plus size={12} />
                        Añadir
                      </button>
                    </div>

                    {/* Add / edit form */}
                    <AnimatePresence>
                      {memFormOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-white/5 border border-white/10">
                            <input
                              type="text"
                              placeholder="Clave (ej: objetivo)"
                              value={memFormKey}
                              onChange={(e) => setMemFormKey(e.target.value)}
                              className="input-field text-xs py-1 px-2"
                            />
                            <input
                              type="text"
                              placeholder="Valor (ej: ganar masa muscular)"
                              value={memFormValue}
                              onChange={(e) => setMemFormValue(e.target.value)}
                              className="input-field text-xs py-1 px-2"
                            />
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => setMemFormOpen(false)}
                                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1"
                              >
                                Cancelar
                              </button>
                              <button
                                disabled={
                                  !memFormKey.trim() ||
                                  !memFormValue.trim() ||
                                  memFormSaving
                                }
                                onClick={async () => {
                                  if (
                                    !memFormKey.trim() ||
                                    !memFormValue.trim()
                                  )
                                    return;
                                  setMemFormSaving(true);
                                  try {
                                    await saveMemoryItem(
                                      memFormKey,
                                      memFormValue,
                                    );
                                    const updated = await getMemories();
                                    setMemories(updated);
                                    setMemFormOpen(false);
                                  } finally {
                                    setMemFormSaving(false);
                                  }
                                }}
                                className="flex items-center gap-1 text-xs btn-primary px-2 py-1 rounded-lg disabled:opacity-40"
                              >
                                {memFormSaving ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <Check size={10} />
                                )}
                                Guardar
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {memories.length === 0 ? (
                      <p className="text-xs text-slate-600 italic">
                        Sin recuerdos guardados aún
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {memories.map((mem) => (
                          <span
                            key={mem.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300"
                          >
                            <span className="text-primary font-medium">
                              {mem.key}:
                            </span>{" "}
                            {mem.value}
                            <button
                              onClick={() => {
                                setMemFormKey(mem.key);
                                setMemFormValue(mem.value);
                                setMemFormOpen(true);
                              }}
                              className="ml-0.5 text-slate-600 hover:text-primary transition-colors"
                              aria-label={`Editar recuerdo: ${mem.key}`}
                            >
                              <Pencil size={10} />
                            </button>
                            <button
                              onClick={async () => {
                                await deleteMemoryItem(mem.id);
                                setMemories((prev) =>
                                  prev.filter((m) => m.id !== mem.id),
                                );
                              }}
                              className="text-slate-600 hover:text-red-400 transition-colors"
                              aria-label={`Borrar recuerdo: ${mem.key}`}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingHistory && isEmpty ? (
                /* Loading skeleton while history fetches */
                <div className="flex flex-col gap-3 py-4">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`${
                          i % 2 === 0 ? "mr-auto" : "ml-auto"
                        } max-w-[80%] px-4 py-3 rounded-2xl ${
                          i % 2 === 0
                            ? "rounded-tl-sm bg-white/5 border border-white/8"
                            : "rounded-tr-sm bg-primary/20 border border-primary/20"
                        }`}
                      >
                        <div className="flex flex-col gap-2">
                          <SkeletonBlock
                            className={`h-3 ${["w-3/4", "w-1/2", "w-2/3"][i % 3]}`}
                          />
                          <SkeletonBlock className="h-3 w-1/3" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : isEmpty && aiWaking && !aiReady ? (
                /* Wakeup state — ai-server cold start on Render */
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <Loader2 size={28} className="text-primary animate-spin" />
                  <div className="text-center">
                    <p className="text-white font-semibold text-sm">
                      Iniciando asistente…
                    </p>
                    <p className="text-slate-500 text-xs mt-1.5 leading-relaxed max-w-[220px]">
                      El servidor está en reposo. El arranque puede tardar hasta
                      60 segundos en Render (plan gratuito).
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1">
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
                      {aiElapsed}s
                    </span>
                  </div>
                </div>
              ) : rateLimitReached ? (
                /* Rate limit reached state */
                <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
                  <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center">
                    <span className="text-2xl">⏳</span>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-sm">
                      Límite alcanzado
                    </p>
                    <p className="text-slate-400 text-xs mt-1.5 max-w-[240px] leading-relaxed">
                      Has usado {usage!.used}/{usage!.limit} consultas.
                      {usage!.reset_at
                        ? ` Disponible en ${formatCountdown(timeLeft)}.`
                        : ""}
                    </p>
                  </div>
                </div>
              ) : isEmpty ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
                  <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center">
                    <Sparkles size={28} className="text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-base">
                      GymChat
                    </p>
                    <p className="text-slate-400 text-sm mt-1.5 max-w-[260px] leading-relaxed">
                      Pregúntame sobre tus entrenamientos, récords o salud.
                    </p>
                  </div>
                  <div className="w-full grid grid-cols-1 gap-2">
                    {EXAMPLE_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleExampleClick(prompt)}
                        className="cursor-pointer px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-sm text-slate-300 hover:bg-white/10 hover:border-primary/30 transition-all text-left"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) =>
                    msg.role === "user" ? (
                      <div
                        key={i}
                        className="ml-auto max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-primary/20 border border-primary/20 text-white text-sm whitespace-pre-wrap"
                      >
                        {msg.content}
                      </div>
                    ) : (
                      <AssistantBubble key={i} content={msg.content} />
                    ),
                  )}

                  {/* Thinking dots */}
                  {thinking && <ThinkingDots />}

                  {/* Streaming response */}
                  {streaming && streamingContent && (
                    <AssistantBubble content={streamingContent} cursor />
                  )}

                  {/* Error message */}
                  {errorMessage && (
                    <div className="mr-auto max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-danger/10 border border-danger/20 text-red-300 text-sm">
                      {errorMessage}
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-white/8 flex gap-2 items-end shrink-0">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                disabled={isInputBlocked}
                placeholder={
                  rateLimitReached
                    ? "Límite de consultas alcanzado"
                    : aiReady
                      ? "Escribe un mensaje..."
                      : "Iniciando asistente…"
                }
                className="input-field flex-1 resize-none min-h-[42px] max-h-[120px] py-2.5 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ lineHeight: "1.5" }}
              />
              <button
                onClick={handleSend}
                disabled={isInputBlocked || !input.trim()}
                className="btn-primary w-10 h-10 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Enviar mensaje"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChatPanel;
