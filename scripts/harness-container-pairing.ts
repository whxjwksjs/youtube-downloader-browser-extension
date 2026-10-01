// Quality-overhaul harness: smart audio container pairing + auto extension.
import { resolveAutoExtension } from "../src/lib/utils/mime-types.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

// Smart pairing: codec -> natural container (no more forced .m4a for opus).
check("opus -> .opus", resolveAutoExtension({ extension: "auto", mimeType: "audio/webm; codecs=opus", isAudio: true }), "opus");
check("vorbis -> .ogg", resolveAutoExtension({ extension: "auto", mimeType: "audio/webm; codecs=vorbis", isAudio: true }), "ogg");
check("aac -> .m4a", resolveAutoExtension({ extension: "auto", mimeType: "audio/mp4; codecs=mp4a.40.2", isAudio: true }), "m4a");
check("mp3 -> .mp3", resolveAutoExtension({ extension: "auto", mimeType: "audio/mpeg", isAudio: true }), "mp3");

// Explicit extension choice is never overridden.
check("explicit m4a kept", resolveAutoExtension({ extension: "m4a", mimeType: "audio/webm; codecs=opus", isAudio: true }), "m4a");

// Video path unchanged.
check("video webm", resolveAutoExtension({ extension: "auto", mimeType: "video/webm; codecs=vp9", isAudio: false }), "webm");
check("video mp4", resolveAutoExtension({ extension: "auto", mimeType: "video/mp4; codecs=avc1", isAudio: false }), "mp4");

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("container pairing harness: all checks passed");
