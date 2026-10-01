export const DiagnosticLogLevel = {
  Info: "info",
  Warn: "warn",
  Error: "error"
} as const;

export type DiagnosticLogLevel = (typeof DiagnosticLogLevel)[keyof typeof DiagnosticLogLevel];

export type DiagnosticLogEntry = {
  timestamp: number;
  level: DiagnosticLogLevel;
  tag: string;
  message: string;
};

const MAX_ENTRIES = 500;
const MAX_URL_LENGTH = 220;

// Query params and fragments whose values must never appear in an exported log.
const SENSITIVE_PARAM_PATTERN = /(token|sig(nature)?|key|auth|session|cookie|po[_-]?token|visitor[_-]?data|client[_-]?secret|id[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|playback[_-]?context|cpn|ei\b)/i;

function redactUrl(value: string) {
  const urlPattern = /https?:\/\/[^\s"'<>]+/g;
  return value.replace(urlPattern, url =>
    (url.length > MAX_URL_LENGTH ? `${url.slice(0, MAX_URL_LENGTH)}…` : url));
}

// Sensitive query params can also show up without a full URL (e.g. "?sig=…"
// in a short status message), so redact them across the whole string.
function redactSensitiveParams(value: string) {
  return value.replace(/([?&#;])([^?&#;=\s]+)=([^?&#;\s]*)/g, (match, sep, name, paramValue) => {
    const isSensitive = SENSITIVE_PARAM_PATTERN.test(name);
    return `${sep}${name}=${isSensitive ? "[redacted]" : paramValue}`;
  });
}

function redactLongTokens(value: string) {
  // Long base64url-ish runs are almost always opaque tokens.
  return value.replace(/[A-Za-z0-9\-_]{48,}/g, match => {
    const isLikelyToken = /[A-Z]/.test(match) && /[a-z]/.test(match) && /[0-9]/.test(match);
    return isLikelyToken ? "[token]" : match;
  });
}

export function sanitizeLogMessage(message: string) {
  return redactLongTokens(redactSensitiveParams(redactUrl(message)));
}

export function formatLogEntry(entry: DiagnosticLogEntry) {
  const time = new Date(entry.timestamp).toISOString();
  return `[${time}] [${entry.level}] [${entry.tag}] ${entry.message}`;
}

type DiagnosticSink = (level: DiagnosticLogLevel, tag: string, message: string) => void;

let activeSink: DiagnosticSink | null = null;

// Each runtime context (background worker, content script) installs its own
// sink once at startup; shared library code then just calls logDiag.
export function setDiagnosticSink(sink: DiagnosticSink | null) {
  activeSink = sink;
}

export function logDiag(level: DiagnosticLogLevel, tag: string, message: string) {
  activeSink?.(level, tag, message);
}

export function createDiagnosticLog() {
  const entries: DiagnosticLogEntry[] = [];

  function record(level: DiagnosticLogLevel, tag: string, message: string) {
    entries.push({
      timestamp: Date.now(),
      level,
      tag,
      message: sanitizeLogMessage(message)
    });

    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
  }

  function merge(entry: DiagnosticLogEntry) {
    entries.push({
      ...entry,
      message: sanitizeLogMessage(entry.message)
    });

    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
  }

  function getAll() {
    return [...entries];
  }

  function clear() {
    entries.length = 0;
  }

  return { record, merge, getAll, clear };
}
