import type { Prettify } from "@/types";

const INNERTUBE_PLAYER_URL = "https://www.youtube.com/youtubei/v1/player";
const ANDROID_VR_CLIENT_NAME = "ANDROID_VR";
const ANDROID_VR_CLIENT_VERSION = "1.65.10";
const ANDROID_VR_SDK_VERSION = 32;
const ANDROID_VR_DEVICE_MAKE = "Oculus";
const ANDROID_VR_DEVICE_MODEL = "Quest 3";
const ANDROID_VR_USER_AGENT =
  "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L) gzip";
const ANDROID_VR_OS_NAME = "Android";
const ANDROID_VR_OS_VERSION = "12L";
const WEB_EMBEDDED_CLIENT_NAME = "WEB_EMBEDDED_PLAYER";
const WEB_EMBEDDED_CLIENT_VERSION = "2.20260708.00.00";
const EMBED_URL_BASE = "https://www.youtube.com/embed";
const CONTENT_TYPE_JSON = "application/json";
const PLAYABILITY_STATUS_OK = "OK";

// Substrings yt-dlp's `_is_agegated` matches against the lowercased
// playability status and reason, plus the AGE_CHECK_REQUIRED status the
// extension's own PlayabilityStatus enum already names.
const AGE_GATE_MARKERS = [
  "confirm your age",
  "age-restricted",
  "inappropriate",
  "age_verification_required",
  "age_check_required"
];

// Placeholder substituted in MAIN-world by page-sabr-fetch.content.ts so the BG
// never needs to read ytcfg.VISITOR_DATA directly (extension contexts cannot
// reach the page's ytcfg).
const VISITOR_DATA_TOKEN = "__YTDL_VISITOR_DATA__";

export type AndroidStreamingFormat = Prettify<{
  itag: number;
  url: string;
  mimeType: string;
  contentLength: string;
  bitrate: number;
  width?: number;
  height?: number;
  audioChannels?: number;
  audioSampleRate?: string;
}>;

export type AndroidPlayerResponse = Prettify<{
  playabilityStatus?: {
    status?: string;
    reason?: string;
    desktopLegacyAgeGateReason?: unknown;
  };
  streamingData?: {
    formats?: AndroidStreamingFormat[];
    adaptiveFormats?: AndroidStreamingFormat[];
  };
}>;

// Mirrors yt-dlp's `_is_agegated`: an explicit legacy age-gate flag, or an
// age marker in the playability status/reason (for example LOGIN_REQUIRED
// with "Sign in to confirm your age"). A plain LOGIN_REQUIRED bot-gate
// response ("confirm you're not a bot") deliberately does not match - that
// gate is handled by the page-proxy retry in the download callers, not by
// switching clients.
export function isAgeGatedPlayerResponse(response: AndroidPlayerResponse) {
  const playabilityStatus = response.playabilityStatus;
  if (!playabilityStatus) {
    return false;
  }

  if (playabilityStatus.desktopLegacyAgeGateReason) {
    return true;
  }

  const statusAndReason = `${playabilityStatus.status ?? ""} ${playabilityStatus.reason ?? ""}`.toLowerCase();
  return AGE_GATE_MARKERS.some(marker => statusAndReason.includes(marker));
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type PlayerRequestContext = Prettify<{
  client: Record<string, string | number>;
  thirdParty?: {
    embedUrl: string;
  };
}>;

type FetchPlayerResponseParams = Prettify<{
  videoId: string;
  clientName: string;
  context: PlayerRequestContext;
  customFetch?: FetchFn;
}>;

// Sends one InnerTube `/player` request. Every client goes through the same
// fetch function, so a caller-supplied page-proxy fetch (session cookies and
// the page's TLS context, with the real visitorData substituted in
// MAIN-world) is reused for the age-gate fallback exactly as for the primary
// request; the BG-direct fetch relies on `credentials: "include"` to carry
// the signed-in session cookies.
async function fetchPlayerResponse({
  videoId, clientName, context, customFetch
}: FetchPlayerResponseParams): Promise<AndroidPlayerResponse> {
  const body = {
    context,
    videoId,
    contentCheckOk: true,
    racyCheckOk: true
  };
  const performFetch = customFetch ?? fetch;
  const response = await performFetch(INNERTUBE_PLAYER_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": CONTENT_TYPE_JSON
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${clientName} player API HTTP ${response.status}`);
  }

  return response.json();
}

type FetchAndroidPlayerResponseParams = Prettify<{
  videoId: string;
  customFetch?: FetchFn;
}>;

// Fetches a YouTube InnerTube `/player` response using the ANDROID_VR client
// (X-YouTube-Client-Name 28). yt-dlp's `android_vr` extractor relies on the
// same client because it is the only first-party client that returns direct
// CDN URLs for all adaptive formats without requiring a PO token, without
// forcing SABR, and without imposing the 4 MB per-request range cap that the
// plain `ANDROID` client enforces.
//
// `credentials: "include"` alone (with `visitorData` embedded in the context)
// is sufficient to pass YouTube's anti-bot gate. Without `visitorData` the
// response is `LOGIN_REQUIRED: "Sign in to confirm you're not a bot"`.
async function fetchAndroidPlayerResponse({
  videoId, customFetch
}: FetchAndroidPlayerResponseParams): Promise<AndroidPlayerResponse> {
  return fetchPlayerResponse({
    videoId,
    customFetch,
    clientName: ANDROID_VR_CLIENT_NAME,
    context: {
      client: {
        clientName: ANDROID_VR_CLIENT_NAME,
        clientVersion: ANDROID_VR_CLIENT_VERSION,
        deviceMake: ANDROID_VR_DEVICE_MAKE,
        deviceModel: ANDROID_VR_DEVICE_MODEL,
        androidSdkVersion: ANDROID_VR_SDK_VERSION,
        userAgent: ANDROID_VR_USER_AGENT,
        osName: ANDROID_VR_OS_NAME,
        osVersion: ANDROID_VR_OS_VERSION,
        hl: "en",
        gl: "US",
        visitorData: VISITOR_DATA_TOKEN
      }
    }
  });
}

// Age-gate fallback documented by yt-dlp: the WEB_EMBEDDED_PLAYER client can
// work around the age gate and age verification for videos that allow
// embedding, because embedded players have no sign-in flow of their own. The
// request still carries the session (`credentials: "include"` or the
// page-proxy fetch) and the page's visitorData, so a signed-in,
// age-confirmed user keeps the full session context; `thirdParty.embedUrl`
// is what marks the request as an embedded-player request. Client version
// follows yt-dlp's `web_embedded` entry in INNERTUBE_CLIENTS.
async function fetchWebEmbeddedPlayerResponse({
  videoId, customFetch
}: FetchAndroidPlayerResponseParams): Promise<AndroidPlayerResponse> {
  return fetchPlayerResponse({
    videoId,
    customFetch,
    clientName: WEB_EMBEDDED_CLIENT_NAME,
    context: {
      client: {
        clientName: WEB_EMBEDDED_CLIENT_NAME,
        clientVersion: WEB_EMBEDDED_CLIENT_VERSION,
        hl: "en",
        gl: "US",
        visitorData: VISITOR_DATA_TOKEN
      },
      thirdParty: {
        embedUrl: `${EMBED_URL_BASE}/${videoId}`
      }
    }
  });
}

export type ResolvedAndroidUrls = Prettify<{
  videoUrl: string | null;
  videoContentLength: number;
  audioUrl: string | null;
  audioContentLength: number;
  extraAudioUrls: {
    url: string | null;
    contentLength: number;
  }[];
}>;

function parseContentLength(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

type ResolveAndroidUrlsParams = Prettify<{
  videoId: string;
  videoItag?: number;
  audioItag?: number;
  extraAudioItags?: number[];
  customFetch?: FetchFn;
}>;

function extractResolvedUrls(
  response: AndroidPlayerResponse,
  { videoItag, audioItag, extraAudioItags }: Omit<ResolveAndroidUrlsParams, "videoId" | "customFetch">
): ResolvedAndroidUrls {
  const adaptiveFormats = response.streamingData?.adaptiveFormats ?? [];
  const progressiveFormats = response.streamingData?.formats ?? [];
  const allFormats = [...adaptiveFormats, ...progressiveFormats];

  const videoMatch = videoItag != null ? allFormats.find(format => format.itag === videoItag) : null;
  const audioMatch = audioItag != null ? allFormats.find(format => format.itag === audioItag) : null;
  const extraAudioUrls = (extraAudioItags ?? []).map(itag => {
    const match = allFormats.find(format => format.itag === itag);
    return {
      url: match?.url ?? null,
      contentLength: parseContentLength(match?.contentLength)
    };
  });

  return {
    videoUrl: videoMatch?.url ?? null,
    videoContentLength: parseContentLength(videoMatch?.contentLength),
    audioUrl: audioMatch?.url ?? null,
    audioContentLength: parseContentLength(audioMatch?.contentLength),
    extraAudioUrls
  };
}

function isPlayablePlayerResponse(response: AndroidPlayerResponse) {
  return response.playabilityStatus?.status === PLAYABILITY_STATUS_OK;
}

export async function resolveAndroidUrls({
  videoId, videoItag, audioItag, extraAudioItags, customFetch
}: ResolveAndroidUrlsParams): Promise<ResolvedAndroidUrls> {
  const requestedItags = {
    videoItag,
    audioItag,
    extraAudioItags
  };
  const response = await fetchAndroidPlayerResponse({
    videoId,
    customFetch
  });
  if (isPlayablePlayerResponse(response)) {
    return extractResolvedUrls(response, requestedItags);
  }

  const isAgeGated = isAgeGatedPlayerResponse(response);
  if (!isAgeGated) {
    throw new Error(`ANDROID_VR player not playable: ${response.playabilityStatus?.status} ${response.playabilityStatus?.reason ?? ""}`);
  }

  // Age-restricted: ANDROID_VR refuses even with a session, so retry once
  // with the embedded-player client through the same fetch (same cookies,
  // same visitorData). Only age gates take this detour - every other video
  // keeps the ANDROID_VR response and its full-quality format list, and the
  // requested itags are matched exactly here too, so a fallback response
  // that lacks the selected quality surfaces as a missing URL to the caller
  // instead of silently downloading a lower quality.
  const embeddedResponse = await fetchWebEmbeddedPlayerResponse({
    videoId,
    customFetch
  });
  if (isPlayablePlayerResponse(embeddedResponse)) {
    return extractResolvedUrls(embeddedResponse, requestedItags);
  }

  if (isAgeGatedPlayerResponse(embeddedResponse)) {
    throw new Error(
      `Age-restricted video: YouTube requires age confirmation - sign in to YouTube in this browser, confirm your age on the watch page, then try again (${embeddedResponse.playabilityStatus?.status} ${embeddedResponse.playabilityStatus?.reason ?? ""})`
    );
  }

  throw new Error(`WEB_EMBEDDED_PLAYER player not playable: ${embeddedResponse.playabilityStatus?.status} ${embeddedResponse.playabilityStatus?.reason ?? ""}`);
}
