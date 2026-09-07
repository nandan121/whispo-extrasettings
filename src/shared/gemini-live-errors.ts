// Shared helpers for Gemini Live session failure detail.
// Used by both the main-process session (src/main/gemini-live.ts) and any
// renderer-side handling. Pure functions, no DOM/Node APIs.

function safeStringify(value: unknown, maxLen = 300): string {
  try {
    const s =
      typeof value === "string" ? value : JSON.stringify(value) ?? String(value)
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s
  } catch {
    return String(value)
  }
}

function isCloseLike(
  value: unknown,
): value is { code?: unknown; reason?: unknown; wasClean?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    ("code" in value || "reason" in value || "wasClean" in value)
  )
}

export function describeLiveError(event: unknown): string {
  if (event instanceof Error) return event.message || event.name
  if (typeof event === "string") return event
  if (typeof event === "object" && event !== null) {
    // DOM ErrorEvent from the WebSocket layer. NOTE: Chromium reports
    // handshake failures as an opaque event with no message/code — just
    // { isTrusted: true }. Callers should treat that as a transport failure.
    if ("message" in event && typeof event.message === "string" && event.message) {
      return event.message
    }
    if (isCloseLike(event)) return describeLiveClose(event)
    if (
      "isTrusted" in event &&
      Object.keys(event).length === 1 &&
      event.isTrusted === true
    ) {
      return "WebSocket connection failed before opening (opaque browser network error — no detail provided)"
    }
  }
  const s = safeStringify(event)
  return s && s !== "{}" ? s : "Unknown live session error"
}

export function describeLiveClose(event: unknown): string {
  if (isCloseLike(event)) {
    const code = typeof event.code === "number" ? event.code : "unknown code"
    const reason =
      typeof event.reason === "string" && event.reason
        ? event.reason
        : "no reason given"
    const hint =
      code === 1006
        ? " (abnormal closure — network, proxy, or firewall interrupted the WebSocket)"
        : code === 1008
          ? " (server rejected the session — model, key entitlement, or parameters)"
          : ""
    return `Live session closed (code=${code}): ${reason}${hint}`
  }
  return `Live session closed: ${safeStringify(event)}`
}
