import axios from "axios";

export type ServerSyncStage =
  | "google_calendar"
  | "fitbit_auth"
  | "fitbit_api"
  | "processing"
  | "database_persistence";
export type ClientSyncStage = "ui" | "http_request" | ServerSyncStage;

export interface SyncDiagnostic {
  stage: ClientSyncStage;
  code: string;
  retryable: boolean;
  correlationId: string;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SERVER_STAGES = new Set<ServerSyncStage>([
  "google_calendar",
  "fitbit_auth",
  "fitbit_api",
  "processing",
  "database_persistence",
]);

const SERVER_CODES = new Set([
  "GOOGLE_CALENDAR_NOT_CONNECTED",
  "GOOGLE_CALENDAR_REAUTH_REQUIRED",
  "GOOGLE_CALENDAR_API_RATE_LIMITED",
  "GOOGLE_CALENDAR_API_UNAVAILABLE",
  "GOOGLE_CALENDAR_API_TIMEOUT",
  "GOOGLE_CALENDAR_API_REJECTED",
  "FITBIT_REAUTH_REQUIRED",
  "FITBIT_AUTH_UNAVAILABLE",
  "FITBIT_AUTH_TIMEOUT",
  "FITBIT_API_RATE_LIMITED",
  "FITBIT_API_UNAVAILABLE",
  "FITBIT_API_TIMEOUT",
  "FITBIT_API_REJECTED",
  "FITBIT_RESPONSE_INVALID",
  "FITBIT_ACTIVITY_PROCESSING_FAILED",
  "FITBIT_MATCHING_FAILED",
  "FITBIT_PROCESSING_FAILED",
  "FITBIT_PERSISTENCE_FAILED",
]);

export class SyncDiagnosticError extends Error {
  readonly diagnostic: SyncDiagnostic;

  constructor(diagnostic: SyncDiagnostic) {
    super(diagnostic.code);
    this.name = "SyncDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function createCorrelationId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function invalidSyncResponse(
  correlationId: string,
): SyncDiagnosticError {
  return new SyncDiagnosticError({
    stage: "http_request",
    code: "HTTP_RESPONSE_INVALID",
    retryable: true,
    correlationId,
  });
}

function parseServerDetail(value: unknown): SyncDiagnostic | null {
  if (!value || typeof value !== "object") return null;
  const detail = value as Record<string, unknown>;
  if (
    typeof detail.stage !== "string" ||
    !SERVER_STAGES.has(detail.stage as ServerSyncStage) ||
    typeof detail.code !== "string" ||
    !SERVER_CODES.has(detail.code) ||
    typeof detail.retryable !== "boolean" ||
    !isCanonicalUuid(detail.correlation_id)
  ) {
    return null;
  }
  return {
    stage: detail.stage as ServerSyncStage,
    code: detail.code,
    retryable: detail.retryable,
    correlationId: detail.correlation_id,
  };
}

export function normalizeSyncError(
  error: unknown,
  localCorrelationId: string,
): SyncDiagnostic {
  if (error instanceof SyncDiagnosticError) return error.diagnostic;

  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return {
        stage: "http_request",
        code:
          error.code === "ECONNABORTED" ? "HTTP_TIMEOUT" : "HTTP_NETWORK_ERROR",
        retryable: true,
        correlationId: localCorrelationId,
      };
    }
    const body = error.response.data;
    const serverDiagnostic =
      body && typeof body === "object"
        ? parseServerDetail((body as Record<string, unknown>).detail)
        : null;
    return (
      serverDiagnostic ?? {
        stage: "http_request",
        code: "HTTP_RESPONSE_INVALID",
        retryable: true,
        correlationId: localCorrelationId,
      }
    );
  }

  return {
    stage: "ui",
    code: "UI_SYNC_FAILED",
    retryable: false,
    correlationId: localCorrelationId,
  };
}

const STAGE_PRIORITY: Record<ClientSyncStage, number> = {
  database_persistence: 0,
  google_calendar: 1,
  fitbit_auth: 2,
  fitbit_api: 3,
  processing: 4,
  http_request: 5,
  ui: 6,
};

export function prioritizeDiagnostics(
  diagnostics: SyncDiagnostic[],
): SyncDiagnostic | null {
  return (
    diagnostics.reduce<SyncDiagnostic | null>(
      (highest, current) =>
        !highest ||
        STAGE_PRIORITY[current.stage] < STAGE_PRIORITY[highest.stage]
          ? current
          : highest,
      null,
    ) ?? null
  );
}

export function syncDiagnosticMessage(diagnostic: SyncDiagnostic): string {
  const reference = ` Referencia: ${diagnostic.correlationId}`;
  switch (diagnostic.stage) {
    case "database_persistence":
      return `GymHub no pudo guardar los datos sincronizados. No se aplicaron los cambios pendientes.${reference}`;
    case "fitbit_auth":
      return diagnostic.code === "FITBIT_REAUTH_REQUIRED"
        ? `Fitbit necesita volver a conectarse.${reference}`
        : `La autenticación de Fitbit no está disponible temporalmente. Inténtalo de nuevo más tarde.${reference}`;
    case "google_calendar":
      return diagnostic.code === "GOOGLE_CALENDAR_REAUTH_REQUIRED" ||
        diagnostic.code === "GOOGLE_CALENDAR_NOT_CONNECTED"
        ? `Google Calendar necesita volver a conectarse.${reference}`
        : `Google Calendar no está disponible temporalmente. Inténtalo de nuevo más tarde.${reference}`;
    case "fitbit_api":
      return `Fitbit no está disponible temporalmente. Inténtalo de nuevo más tarde.${reference}`;
    case "processing":
      return `GymHub no pudo procesar o asociar algunas actividades de Fitbit.${reference}`;
    case "http_request":
      return `No se pudo comunicar con GymHub. Comprueba tu conexión e inténtalo de nuevo.${reference}`;
    case "ui":
      return `La interfaz no pudo completar la sincronización.${reference}`;
  }
}
