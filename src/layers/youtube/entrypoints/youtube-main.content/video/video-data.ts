import { capturedPoToken, capturedPoTokenVideoId, setPoTokenCredentials } from "./captured-credentials";
import {
  extractGenresFromKeywords,
  fetchYouTubeMusicGenres,
  parseDescriptionMetadata,
  parseMusicTitle
} from "./music-metadata";
import { sabrCredentials } from "@/lib/ui/synced-stores.svelte";
import { type VideoData } from "@/types";
import { generatePoToken } from "#youtube/lib/youtube/po-token-generator";
import { getYtcfg, YtcfgKey } from "#youtube/lib/youtube/ytcfg";

export { buildAndDispatchVideoData } from "./capture-dispatch";

export const videoDataCache = new Map<string, VideoData>();

export function readYtcfg() {
  return {
    clientVersion: getYtcfg(YtcfgKey.ClientVersion) ?? "",
    clientName: getYtcfg(YtcfgKey.ClientName) ?? 1
  };
}

export async function buildVideoMetadata(videoId: string) {
  const cached = videoDataCache.get(videoId);
  if (!cached) {
    return null;
  }

  const { playerResponse } = cached;
  const { videoDetails, microformat } = playerResponse;

  const renderer = microformat?.playerMicroformatRenderer;
  const description = videoDetails?.shortDescription ?? "";
  const titleMeta = cached.isMusic ? parseMusicTitle(cached.title) : null;
  const descriptionMeta = cached.isMusic ? parseDescriptionMetadata(description) : null;
  const keywords = videoDetails?.keywords ?? [];
  const genreSet = cached.isMusic ? await fetchYouTubeMusicGenres() : new Set<string>();
  const genres = extractGenresFromKeywords({
    keywords,
    genreSet
  });

  const title = descriptionMeta?.songTitle || titleMeta?.songTitle || cached.title;
  const artist = descriptionMeta?.artist || titleMeta?.fullArtist || videoDetails?.author || "";
  const albumArtist = descriptionMeta?.mainArtist || titleMeta?.mainArtist || undefined;
  const isGenresPresent = genres.length > 0;

  // Pick the largest thumbnail by width rather than blindly taking the last
  // entry: the array isn't guaranteed to be size-ordered, and mobile player
  // responses have served smaller webp variants last.
  const thumbnails = videoDetails?.thumbnail?.thumbnails ?? [];
  const largestThumbnail = thumbnails.reduce<{ url: string; width: number; height: number } | undefined>(
    (best, current) => (current.width > (best?.width ?? 0) ? current : best),
    undefined
  );
  const youtubeThumbnailUrl = largestThumbnail?.url ?? thumbnails.at(-1)?.url;

  return {
    title,
    artist,
    albumArtist: albumArtist !== artist ? albumArtist : undefined,
    album: descriptionMeta?.album,
    genres: isGenresPresent ? genres : undefined,
    date: renderer?.publishDate,
    thumbnailUrl: youtubeThumbnailUrl,
    isMusic: cached.isMusic
  };
}

const PO_TOKEN_GENERATION_ATTEMPTS = 3;

async function generateAndStorePoToken(videoData: VideoData) {
  const poToken = await generatePoToken(videoData.videoId);
  const { serverAbrStreamingUrl: sabrUrl = "" } = videoData.sabrConfig ?? {};
  setPoTokenCredentials({
    poToken,
    sabrUrl,
    videoId: videoData.videoId
  });
  sabrCredentials.value = {
    url: sabrCredentials.value?.url || sabrUrl,
    poToken
  };
}

// GenerateIT intermittently returns no integrity token; each attempt fetches a fresh
// BotGuard challenge, so retrying recovers the transient that would otherwise dispatch
// SABR unauthenticated and 403.
async function generatePoTokenWithRetries(videoData: VideoData) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= PO_TOKEN_GENERATION_ATTEMPTS; attempt++) {
    try {
      await generateAndStorePoToken(videoData);
      return null;
    } catch (error) {
      lastError = error;
    }
  }

  return lastError;
}

export async function generatePoTokenIfNeeded(videoData: VideoData) {
  const isCurrentPoTokenPresent = capturedPoToken && capturedPoTokenVideoId === videoData.videoId;
  if (isCurrentPoTokenPresent) {
    return;
  }

  const lastError = await generatePoTokenWithRetries(videoData);
  if (lastError) {
    console.warn("[ytdl] PO token generation failed:", lastError);
  }
}

export { extractAndDispatchVideoData } from "./capture-dispatch";
