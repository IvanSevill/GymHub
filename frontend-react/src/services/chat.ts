import { getToken } from "./tokenStore";

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
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export async function clearHistory(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${AI_URL}/chat/history`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    throw err instanceof Error ? err : new Error("Error al borrar historial");
  }
}

export async function getHistory(): Promise<ChatMessage[]> {
  const token = getToken();
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

export interface ChatUsage {
  used: number;
  limit: number;
  reset_at: string | null;
  is_root: boolean;
}

export async function getUsage(): Promise<ChatUsage | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${AI_URL}/chat/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as ChatUsage;
  } catch {
    return null;
  }
}

export interface ChatMemoryItem {
  id: string;
  key: string;
  value: string;
  created_at: string;
}

export async function getMemories(): Promise<ChatMemoryItem[]> {
  const token = getToken();
  if (!token) return [];
  try {
    const res = await fetch(`${AI_URL}/chat/memory`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as ChatMemoryItem[];
  } catch {
    return [];
  }
}

export async function deleteMemoryItem(id: string): Promise<void> {
  const token = getToken();
  if (!token) return;
  await fetch(`${AI_URL}/chat/memory/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function saveMemoryItem(
  key: string,
  value: string,
): Promise<void> {
  const token = getToken();
  if (!token) return;
  const res = await fetch(`${AI_URL}/chat/memory`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ key: key.trim(), value: value.trim() }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function* streamChat(
  messages: ChatMessage[],
): AsyncGenerator<ChatEvent> {
  const token = getToken();
  if (!token) {
    yield {
      type: "error",
      message: "Sesión no iniciada. Por favor inicia sesión.",
    };
    return;
  }

  const trimmed = messages.slice(-10);
  const lastUserMessage = [...trimmed].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) {
    yield { type: "error", message: "No hay mensaje para enviar." };
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${AI_URL}/chat`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ message: lastUserMessage.content }),
    });
  } catch {
    yield {
      type: "error",
      message: "No se pudo conectar con GymChat.",
    };
    return;
  }

  if (!response.ok) {
    let detail = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // use default
    }
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
