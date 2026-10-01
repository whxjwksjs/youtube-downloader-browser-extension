import { createDiagnosticLog, setDiagnosticSink, type DiagnosticLogLevel } from "@/lib/diagnostics/diagnostic-log";
import { MessageType, sendMessage } from "@/lib/messaging/messaging";

const contentLog = createDiagnosticLog();

export function logToDiagnostics(level: DiagnosticLogLevel, tag: string, message: string) {
  contentLog.record(level, tag, message);
  const entries = contentLog.getAll();
  const entry = entries[entries.length - 1];
  if (entry) {
    sendMessage(MessageType.ReportDiagnosticLog, { entry }).catch(() => {});
  }
}

setDiagnosticSink(logToDiagnostics);
