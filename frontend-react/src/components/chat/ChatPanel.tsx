import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { type ChatMessage, streamChat } from "../../services/chat";

const AI_HEALTH_URL = `${import.meta.env.VITE_AI_URL ?? "http://localhost:8001"}/health`;

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

const ChatPanel: React.FC<ChatPanelProps> = ({ open, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      return;
    }

    let cancelled = false;
    let poll: ReturnType<typeof setInterval>;
    let showTimer: ReturnType<typeof setTimeout>;
    let elapsedTimer: ReturnType<typeof setInterval>;
    aiStartRef.current = Date.now();

    const check = async () => {
      try {
        const res = await fetch(AI_HEALTH_URL, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok && !cancelled) {
          clearInterval(poll);
          clearTimeout(showTimer);
          clearInterval(elapsedTimer);
          aiReadyRef.current = true;
          setAiReady(true);
          setAiWaking(false);
        }
      } catch {
        // still waking up
      }
    };

    check();
    poll = setInterval(check, 3000);

    showTimer = setTimeout(() => {
      if (!cancelled && !aiReadyRef.current) {
        setAiWaking(true);
        elapsedTimer = setInterval(
          () =>
            setAiElapsed(Math.floor((Date.now() - aiStartRef.current) / 1000)),
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
  }, [open]);

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

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMsg];

    setMessages(updatedMessages);
    setInput("");
    setStreaming(true);
    setThinking(false);
    setStreamingContent("");
    setErrorMessage(null);

    let accumulated = "";

    try {
      const generator = streamChat(updatedMessages);
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
          break;
        } else if (event.type === "error") {
          setErrorMessage(event.message ?? "Error desconocido");
          setStreamingContent("");
          setStreaming(false);
          setThinking(false);
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

  const isEmpty = messages.length === 0 && !streaming && !errorMessage;
  const isInputBlocked = streaming || !aiReady;

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
                    GymHub AI
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Asistente de fitness
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
                aria-label="Cerrar asistente"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isEmpty && aiWaking && !aiReady ? (
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
              ) : isEmpty ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
                  <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center">
                    <Sparkles size={28} className="text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-base">
                      GymHub AI
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
                      <div
                        key={i}
                        className="mr-auto max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-white/5 border border-white/8 text-slate-200 text-sm whitespace-pre-wrap"
                      >
                        {msg.content}
                      </div>
                    ),
                  )}

                  {/* Thinking dots */}
                  {thinking && <ThinkingDots />}

                  {/* Streaming response */}
                  {streaming && streamingContent && (
                    <div className="mr-auto max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-white/5 border border-white/8 text-slate-200 text-sm whitespace-pre-wrap">
                      {streamingContent}
                      <span className="animate-pulse">▋</span>
                    </div>
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
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isInputBlocked}
                placeholder={
                  aiReady ? "Escribe un mensaje..." : "Iniciando asistente…"
                }
                rows={1}
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
