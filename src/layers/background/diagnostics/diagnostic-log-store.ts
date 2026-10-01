import { createDiagnosticLog, sanitizeLogMessage, setDiagnosticSink, type DiagnosticLogLevel } from "@/lib/diagnostics/diagnostic-log";
import { MessageType, onMessage } from "@/lib/messaging/messaging";

const diagnosticLog = createDiagnosticLog();

export function logToDiagnostics(level: DiagnosticLogLevel, tag: string, message: string) {
  diagnosticLog.record(level, tag, message);
  let consoleFn: (...args: unknown[]) => void = console.log;
  if (level === "error") {
    consoleFn = console.error;
  } else if (level === "warn") {
    consoleFn = console.warn;
  }
  consoleFn(`[ytdl:${tag}]`, sanitizeLogMessage(message));
}

setDiagnosticSink(logToDiagnostics);

export function registerDiagnosticLogHandlers() {
  onMessage(MessageType.ReportDiagnosticLog, ({ data }) => {
    diagnosticLog.merge(data.entry);
  });

  onMessage(MessageType.GetDiagnosticLog, () => diagnosticLog.getAll());

  onMessage(MessageType.ClearDiagnosticLog, () => {
    diagnosticLog.clear();
  });
}
