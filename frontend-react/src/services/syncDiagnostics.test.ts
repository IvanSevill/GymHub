import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";

import {
  SyncDiagnosticError,
  createCorrelationId,
  invalidSyncResponse,
  isCanonicalUuid,
  normalizeSyncError,
  prioritizeDiagnostics,
  syncDiagnosticMessage,
} from "./syncDiagnostics";

const localId = "50debc2b-c826-46d0-9b6e-bf2a4dd9257f";
const serverId = "9cf5b453-2503-47ba-a518-6ef104b2d72c";

function axiosError(data?: unknown, code?: string) {
  return new AxiosError(
    "private token stack",
    code,
    undefined,
    undefined,
    data === undefined
      ? undefined
      : ({
          data,
          status: 500,
          statusText: "Error",
          headers: {},
          config: { headers: {} },
        } as AxiosResponse),
  );
}

describe("sync diagnostics", () => {
  it("generates canonical UUID v4 correlation IDs", () => {
    expect(isCanonicalUuid(createCorrelationId())).toBe(true);
  });

  it("normalizes network and timeout failures without exposing error text", () => {
    expect(normalizeSyncError(axiosError(), localId)).toMatchObject({
      stage: "http_request",
      code: "HTTP_NETWORK_ERROR",
      correlationId: localId,
    });
    expect(
      normalizeSyncError(axiosError(undefined, "ECONNABORTED"), localId).code,
    ).toBe("HTTP_TIMEOUT");
  });

  it("accepts only a complete safe backend diagnostic and server UUID", () => {
    const normalized = normalizeSyncError(
      axiosError({
        detail: {
          stage: "fitbit_auth",
          code: "FITBIT_REAUTH_REQUIRED",
          message: "raw provider body token=secret",
          correlation_id: serverId,
          retryable: false,
        },
      }),
      localId,
    );
    expect(normalized).toEqual({
      stage: "fitbit_auth",
      code: "FITBIT_REAUTH_REQUIRED",
      retryable: false,
      correlationId: serverId,
    });
    expect(syncDiagnosticMessage(normalized)).not.toContain("secret");
  });

  it("normalizes Google Calendar failures with the backend correlation ID", () => {
    const normalized = normalizeSyncError(
      axiosError({
        detail: {
          stage: "google_calendar",
          code: "GOOGLE_CALENDAR_API_UNAVAILABLE",
          message: "Google Calendar is temporarily unavailable.",
          correlation_id: serverId,
          retryable: true,
        },
      }),
      localId,
    );

    expect(normalized).toEqual({
      stage: "google_calendar",
      code: "GOOGLE_CALENDAR_API_UNAVAILABLE",
      retryable: true,
      correlationId: serverId,
    });
    expect(syncDiagnosticMessage(normalized)).toContain("Google Calendar");
    expect(syncDiagnosticMessage(normalized)).toContain(serverId);
  });

  it("rejects malformed, HTML, and untrusted backend details", () => {
    for (const data of [
      "<html>token</html>",
      {},
      { detail: { stage: "sql" } },
    ]) {
      expect(normalizeSyncError(axiosError(data), localId)).toMatchObject({
        stage: "http_request",
        code: "HTTP_RESPONSE_INVALID",
        correlationId: localId,
      });
    }
  });

  it("normalizes local response and UI failures", () => {
    expect(normalizeSyncError(invalidSyncResponse(localId), localId).code).toBe(
      "HTTP_RESPONSE_INVALID",
    );
    expect(normalizeSyncError(new Error("stack token"), localId)).toEqual({
      stage: "ui",
      code: "UI_SYNC_FAILED",
      retryable: false,
      correlationId: localId,
    });
    expect(
      new SyncDiagnosticError(normalizeSyncError(new Error(), localId)).message,
    ).toBe("UI_SYNC_FAILED");
  });

  it("prioritizes actionable stages and uses deterministic safe Spanish copy", () => {
    const diagnostics = [
      normalizeSyncError(new Error("private"), localId),
      {
        stage: "processing" as const,
        code: "RAW_STACK",
        retryable: false,
        correlationId: localId,
      },
      {
        stage: "database_persistence" as const,
        code: "SQL DROP TABLE token",
        retryable: true,
        correlationId: localId,
      },
    ];
    const primary = prioritizeDiagnostics(diagnostics)!;
    const message = syncDiagnosticMessage(primary);
    expect(primary.stage).toBe("database_persistence");
    expect(message).toContain(localId);
    expect(message).not.toContain("SQL");
    expect(message).not.toContain("token");
  });
});
