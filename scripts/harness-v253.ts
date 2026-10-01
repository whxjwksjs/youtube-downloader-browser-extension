// v2.5.3 harness: filename templates + audio codec preference pure logic.
import { resolveFilenameBasename } from "../src/lib/utils/filename.ts";
import { pickPreferredAudioFormat } from "../src/lib/youtube/select-audio-format.ts";
import { AudioCodecPreference, FilenameTemplate } from "../src/types/download-enums.ts";
import type { AdaptiveFormatItem } from "../src/types/youtube.ts";
import type { VideoData } from "../src/types/domain-types.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

const videoData = {
  title: "Some Video Title",
  videoId: "abc123XYZ_-",
  playerResponse: { videoDetails: { author: "Some Channel" } }
} as Pick<VideoData, "title" | "videoId" | "playerResponse">;

check("title", resolveFilenameBasename({ videoData, template: FilenameTemplate.Title }), "Some Video Title");
check("uploader-title", resolveFilenameBasename({ videoData, template: FilenameTemplate.UploaderTitle }), "Some Channel - Some Video Title");
check("title-id", resolveFilenameBasename({ videoData, template: FilenameTemplate.TitleId }), "Some Video Title [abc123XYZ_-]");
check("uploader-title-id", resolveFilenameBasename({ videoData, template: FilenameTemplate.UploaderTitleId }), "Some Channel - Some Video Title [abc123XYZ_-]");

const noAuthor = {
  title: "No Author Video",
  videoId: "zzz999",
  playerResponse: { videoDetails: {} }
} as Pick<VideoData, "title" | "videoId" | "playerResponse">;
check("uploader-title no author falls back", resolveFilenameBasename({ videoData: noAuthor, template: FilenameTemplate.UploaderTitle }), "No Author Video");

const noTitle = {
  title: "",
  videoId: "fallbackId1",
  playerResponse: { videoDetails: { author: "Chan" } }
} as Pick<VideoData, "title" | "videoId" | "playerResponse">;
check("empty title falls back to id", resolveFilenameBasename({ videoData: noTitle, template: FilenameTemplate.Title }), "fallbackId1");

const opus = { itag: 251, mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, audioTrack: { displayName: "en" } } as AdaptiveFormatItem;
const aac = { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, audioTrack: { displayName: "en" } } as AdaptiveFormatItem;
const opusLow = { itag: 249, mimeType: 'audio/webm; codecs="opus"', bitrate: 50000, audioTrack: { displayName: "en" } } as AdaptiveFormatItem;

check("opus pref picks opus", pickPreferredAudioFormat([aac, opus], AudioCodecPreference.Opus)?.itag, 251);
check("opus pref picks best opus", pickPreferredAudioFormat([opusLow, opus, aac], AudioCodecPreference.Opus)?.itag, 251);
check("aac pref picks aac", pickPreferredAudioFormat([opus, aac], AudioCodecPreference.Aac)?.itag, 140);
check("auto picks highest bitrate", pickPreferredAudioFormat([aac, opus], AudioCodecPreference.Auto)?.itag, 251);
check("opus pref falls back when no opus", pickPreferredAudioFormat([aac], AudioCodecPreference.Opus)?.itag, 140);
check("default pref is opus", pickPreferredAudioFormat([aac, opus])?.itag, 251);

if (failures > 0) {
  console.error(`${failures} harness case(s) failed`);
  process.exit(1);
}
console.log("All harness cases passed");
