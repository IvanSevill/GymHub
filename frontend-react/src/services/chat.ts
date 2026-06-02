const AI_URL = import.meta.env.VITE_AI_URL || "http://localhost:8001";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ChatEventType = "text" | "thinking" | "done" | "error";

export interface ChatEvent {
  type: ChatEventType;
  text?: string;
  message?: string;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export async function getHistory(): Promise<ChatMessage[]> {
  const token = localStorage.getItem("token");
  if (!token) return [];
  try {
    const res = await fetch(`${AI_URL}/chat/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as ChatMessage[];
  } catch {
    return [];
  }
}

export async function* streamChat(message: string): AsyncGenerator<ChatEvent> {
  const token = localStorage.getItem("token");
  if (!token) {
    yield {
      type: "error",
      message: "Sesión no iniciada. Por favor inicia sesión.",
    };
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${AI_URL}/chat`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ message }),
    });
  } catch {
    yield {
      type: "error",
      message: "No se pudo conectar con el asistente IA.",
    };
    return;
  }

  if (!response.ok) {
    const detail =
      response.status === 429
        ? "Límite diario alcanzado. Vuelve mañana."
        : `Error ${response.status}`;
    yield { type: "error", message: detail };
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event: ChatEvent = JSON.parse(line.slice(6));
        yield event;
        if (event.type === "done" || event.type === "error") return;
      } catch {
        // ignore malformed lines
      }
    }
  }
}
