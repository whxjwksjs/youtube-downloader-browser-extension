import { isPremiumFormat } from "@/lib/youtube/format-display";
import type { AdaptiveFormatItem } from "@/types";

const MIME_PREFIX_VIDEO = "video";
const MIME_PREFIX_AUDIO = "audio";
const CODEC_PATTERN = /codecs="?([^";]+)"?/;

// Gc's rule: at the same resolution the more efficient codec wins — VP9/AV1
// (and HEVC) outrank H.264 even though YouTube assigns them lower bitrates.
// Between VP9 and AV1 the higher bitrate (bigger file) wins. Resolution still
// rules overall: if H.264 is the only codec at the top resolution, it wins.
function codecRank(mimeType: string) {
  const codec = mimeType.match(CODEC_PATTERN)?.[1]?.toLowerCase() ?? "";
  if (
    codec.startsWith("vp9")
    || codec.startsWith("av01")
    || codec.startsWith("hev1")
    || codec.startsWith("hvc1")
  ) {
    return 0;
  }

  if (codec.startsWith("avc1")) {
    return 1;
  }

  return 2;
}

export function byQualityDesc(formatA: AdaptiveFormatItem, formatB: AdaptiveFormatItem) {
  const heightDiff = (formatB.height ?? 0) - (formatA.height ?? 0);
  if (heightDiff !== 0) {
    return heightDiff;
  }

  const codecDiff = codecRank(formatA.mimeType) - codecRank(formatB.mimeType);
  if (codecDiff !== 0) {
    return codecDiff;
  }

  return formatB.bitrate - formatA.bitrate;
}

export function getUniqueVideoFormats(formats: AdaptiveFormatItem[]) {
  const videoFormats = formats.filter(format => format.mimeType.startsWith(MIME_PREFIX_VIDEO));
  const seen = new Set<string>();

  return videoFormats.filter(format => {
    if (!format.height) {
      return false;
    }

    const key = `${format.height}-${isPremiumFormat(format)}`;
    const isSeenKey = seen.has(key);
    if (isSeenKey) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function getAudioFormats(formats: AdaptiveFormatItem[]) {
  const audioFormats = formats.filter(format => format.mimeType.startsWith(MIME_PREFIX_AUDIO));
  const seenKeys = new Set<string>();
  return audioFormats.filter(format => {
    const key = `${format.itag}:${format.audioTrack?.id ?? ""}`;
    const isSeenKey = seenKeys.has(key);
    if (isSeenKey) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}
