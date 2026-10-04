import { createDiagnosticLog, setDiagnosticSink, type DiagnosticLogLevel } from "@/lib/diagnostics/diagnostic-log";
import { CrossWorldMessage, crossWorldMessenger } from "@/lib/messaging/cross-world-messenger";

const contentLog = createDiagnosticLog();

export function logToDiagnostics(level: DiagnosticLogLevel, tag: string, message: string) {
  contentLog.record(level, tag, message);
  const entries = contentLog.getAll();
  const entry = entries[entries.length - 1];
  if (entry) {
    // MAIN-world scripts cannot use extension messaging (the runtime API is
    // unavailable in the page context), so hop through the isolated world,
    // which forwards the entry to the background log store.
    crossWorldMessenger.sendMessage(CrossWorldMessage.ReportDiagnosticLog, { entry }).catch(() => {});
  }
}

setDiagnosticSink(logToDiagnostics);
