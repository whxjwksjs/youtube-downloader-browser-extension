import type { Prettify } from "@/types";

const JPEG_MAGIC_BYTES = [0xFF, 0xD8, 0xFF];
const THUMBNAIL_WEBP_PATH = "/vi_webp/";
const THUMBNAIL_JPEG_PATH = "/vi/";
const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4E, 0x47];
const RIFF_MAGIC_BYTES = [0x52, 0x49, 0x46, 0x46];
const WEBP_MAGIC_BYTES = [0x57, 0x45, 0x42, 0x50];
const WEBP_MAGIC_OFFSET = 8;

type MatchesMagicBytesParams = Prettify<{
  data: Uint8Array;
  bytes: number[];
  offset?: number;
}>;
function matchesMagicBytes({ data, bytes, offset = 0 }: MatchesMagicBytesParams) {
  return bytes.every((byte, i) => data[offset + i] === byte);
}

function detectImageExtension(data: Uint8Array) {
  if (matchesMagicBytes({
    data,
    bytes: JPEG_MAGIC_BYTES
  })) {
    return "jpg";
  }

  if (matchesMagicBytes({
    data,
    bytes: PNG_MAGIC_BYTES
  })) {
    return "png";
  }

  const isWebp = matchesMagicBytes({
    data,
    bytes: RIFF_MAGIC_BYTES
  }) && matchesMagicBytes({
    data,
    bytes: WEBP_MAGIC_BYTES,
    offset: WEBP_MAGIC_OFFSET
  });
  if (isWebp) {
    return "webp";
  }

  return "jpg";
}

function preferJpegThumbnail(url: string) {
  return url.replace(THUMBNAIL_WEBP_PATH, THUMBNAIL_JPEG_PATH).replace(/\.webp(\?|$)/, ".jpg$1");
}

// The player response's thumbnail array can't be trusted for quality: mobile
// responses have served small WebP variants as the largest entry. Build the
// canonical thumbnail URLs from the video ID instead (this is what yt-dlp
// does): maxresdefault is the original 1280x720 upload thumbnail, with
// sddefault/hqdefault as fallbacks for videos that lack one. The
// player-response URL stays as a last resort.
const THUMBNAIL_BASE_URL = "https://i.ytimg.com/vi/";
const THUMBNAIL_CANDIDATE_NAMES = ["maxresdefault", "sddefault", "hqdefault"] as const;

function buildThumbnailCandidates(videoId: string, fallbackUrl?: string) {
  const candidates = THUMBNAIL_CANDIDATE_NAMES.map(name => `${THUMBNAIL_BASE_URL}${videoId}/${name}.jpg`);
  if (fallbackUrl) {
    candidates.push(preferJpegThumbnail(fallbackUrl));
  }

  return candidates;
}

export async function fetchThumbnail(videoId: string, fallbackUrl?: string) {
  const candidates = buildThumbnailCandidates(videoId, fallbackUrl);
  for (const url of candidates) {
    try {
      // Request JPEG explicitly: i.ytimg.com content-negotiates and will
      // otherwise return WebP bytes even for a .jpg URL when the client's
      // default Accept header advertises image/webp.
      const response = await fetch(url, {
        headers: { Accept: "image/jpeg" }
      });
      if (!response.ok) {
        continue;
      }

      const data = new Uint8Array(await response.arrayBuffer());
      if (data.length === 0) {
        continue;
      }

      return {
        data,
        extension: detectImageExtension(data)
      };
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export function sanitizeForFFmpeg(value: string) {
  return value.replaceAll(/[\n\r"\\]/g, " ").trim();
}
