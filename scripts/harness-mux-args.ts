// Harness: verify mux ffmpeg args use -attach for cover art + watch-url metadata.
import { buildMuxFfmpegArgs } from "../src/layers/processing/entrypoints/mux-worker/mux-ffmpeg-args.ts";

const args = buildMuxFfmpegArgs({
  videoFilename: "vid123-video.mp4",
  audioFilenames: ["vid123-audio0.webm"],
  subtitleFilenames: [],
  coverFilename: "cover.jpg",
  watchUrl: "https://www.youtube.com/watch?v=vid123",
  outputFilename: "out/vid123-mux.mkv",
  muxFilename: "vid123-mux.mkv",
  useIntermediateMkv: true,
  audioMimeType: 'audio/webm; codecs="opus"',
  targetExtension: "mp4",
  audioTracks: [],
  subtitleTracks: [],
  defaultAudioTrackIndex: 0
});

console.log(args.join(" "));

const joined = args.join(" ");
const checks: [string, boolean][] = [
  ["cover attached via -attach", args.includes("-attach") && args[args.indexOf("-attach") + 1] === "cover.jpg"],
  ["mimetype metadata set", joined.includes("mimetype=image/jpeg")],
  ["comment metadata", joined.includes("comment=https://www.youtube.com/watch?v=vid123")],
  ["main video still copied", args.includes("-c:v") && args[args.indexOf("-c:v") + 1] === "copy"],
  ["no attached_pic video stream hack", !joined.includes("attached_pic")]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failed++;
  }
}

const plain = buildMuxFfmpegArgs({
  videoFilename: "v.mp4",
  audioFilenames: ["a.webm"],
  subtitleFilenames: [],
  outputFilename: "out.mp4",
  muxFilename: "m.mkv",
  useIntermediateMkv: false,
  audioMimeType: "audio/mp4",
  targetExtension: "mp4",
  audioTracks: [],
  subtitleTracks: [],
  defaultAudioTrackIndex: 0
});
const cleanOk = !plain.join(" ").includes("-attach") && !plain.join(" ").includes("cover");
console.log(`${cleanOk ? "PASS" : "FAIL"} no-cover path unchanged`);
if (!cleanOk) {
  failed++;
}

process.exit(failed ? 1 : 0);
