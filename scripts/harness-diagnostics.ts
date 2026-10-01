// Diagnostics log harness: sanitization, ring buffer, merge, formatting.
import { createDiagnosticLog, formatLogEntry, sanitizeLogMessage } from "../src/lib/diagnostics/diagnostic-log.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

// 1. Sensitive query params are redacted; harmless ones are kept.
const withSig = sanitizeLogMessage("fetch https://rr1---sn.example.com/videoplayback?sig=ABCDef123456XYZ789&expire=12345&id=o-ABC");
check("sig param redacted", withSig.includes("sig=[redacted]"), true);
check("non-sensitive param kept", withSig.includes("id=o-ABC"), true);

// 2. Long mixed-case tokens are redacted.
const withToken = sanitizeLogMessage("poToken=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789aBcDeFgHiJkLmNoP");
check("long token redacted", withToken.includes("[token]"), true);

// 3. Short strings are untouched.
check("short string untouched", sanitizeLogMessage("audio pipeline: webm -> opus"), "audio pipeline: webm -> opus");

// 4. Ring buffer caps at 500 entries.
const log = createDiagnosticLog();
for (let i = 0; i < 600; i++) {
  log.record("info", "test", `entry ${i}`);
}
const all = log.getAll();
check("ring buffer capped at 500", all.length, 500);
check("oldest entries evicted", all[0].message, "entry 100");
check("newest entries kept", all[499].message, "entry 599");

// 5. merge() sanitizes inbound entries (e.g. from content scripts).
log.merge({ timestamp: 1, level: "error", tag: "capture", message: "failed ?sig=secretTOKEN123456789012345678901234567890" });
const merged = log.getAll().at(-1)!;
check("merge sanitizes", merged.message.includes("sig=[redacted]"), true);

// 6. formatLogEntry shape.
const line = formatLogEntry({ timestamp: 0, level: "warn", tag: "ffmpeg", message: "exit 234" });
check("format has ISO time", line.startsWith("[1970-01-01T00:00:00.000Z]"), true);
check("format has level and tag", line.includes("[warn] [ffmpeg] exit 234"), true);

// 7. clear() empties the buffer.
log.clear();
check("clear empties", log.getAll().length, 0);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("diagnostics harness: all checks passed");
