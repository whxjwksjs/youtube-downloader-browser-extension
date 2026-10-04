import { registerCrossWorldHandlers } from "./cross-world-handlers";
import "./diagnostics/content-diagnostic-log";
import { registerGridDropdownHandlers } from "./grid/grid-dropdown";
import { registerGridTagger } from "./grid/grid-tagger";
import { registerGridVideoDataHandler } from "./grid/grid-video-data";
import { setupIframeSilencer } from "./iframe-silencer";
import { setupAudioTrackWatcher, setupCaptionTrackWatcher } from "./player-watchers";
import { cancelAllActiveDownloads } from "./video/download";
import { extractPlaylistMetadata, handleNavigateSuccess } from "./video/playlist-metadata";
import { extractAndDispatchVideoData } from "./video/video-data";
import { ensureMobileDownloadButton, isMobileYouTube } from "./watch-button/mobile-download-button";
import { logDiag } from "@/lib/diagnostics/diagnostic-log";
import { CrossWorldMessage, crossWorldMessenger } from "@/lib/messaging/cross-world-messenger";
import { initContentOptions } from "@/lib/ui/synced-stores.svelte";
import { INITIAL_OPTIONS } from "@/lib/youtube/video-helpers";
import type { PlayerResponse } from "@/types";

const YTDL_IFRAME_QUERY_PARAM = "ytdl=1";
const EVENT_YT_NAVIGATE_FINISH = "yt-navigate-finish";
const EVENT_YT_NAVIGATE_START = "yt-navigate-start";
const EVENT_PAGEHIDE = "pagehide";
const EVENT_LOAD = "load";

declare global {
  interface Window {
    ytInitialPlayerResponse?: PlayerResponse;
    ytInitialData?: {
      currentVideoEndpoint?: {
        watchEndpoint?: { videoId?: string };
      };
      contents?: {
        twoColumnWatchNextResults?: {
          results?: {
            results?: {
              contents?: Array<{
                videoPrimaryInfoRenderer?: {
                  title?: { runs?: Array<{ text?: string }> };
                };
              }>;
            };
          };
        };
      };
      header?: {
        playlistHeaderRenderer?: {
          title?: { simpleText?: string };
          playlistId?: string;
          ownerText?: { runs?: Array<{ text?: string }> };
        };
      };
      metadata?: {
        playlistMetadataRenderer?: { title?: string };
      };
    };
  }
}

export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  world: "MAIN",
  allFrames: true,
  async main() {
    const isUnrelatedIframe = self !== top && !location.search.includes(YTDL_IFRAME_QUERY_PARAM);
    if (isUnrelatedIframe) {
      return;
    }

    logDiag("info", "content-main", `MAIN script start on ${location.hostname}${location.pathname} (mobile=${isMobileYouTube()}, top=${self === top})`);

    if (self !== top) {
      setupIframeSilencer();
    }

    registerCrossWorldHandlers();
    registerGridDropdownHandlers();
    registerGridTagger();
    registerGridVideoDataHandler();

    document.addEventListener(EVENT_YT_NAVIGATE_FINISH, handleNavigateSuccess);
    document.addEventListener(EVENT_YT_NAVIGATE_FINISH, setupAudioTrackWatcher);
    document.addEventListener(EVENT_YT_NAVIGATE_FINISH, setupCaptionTrackWatcher);
    document.addEventListener(EVENT_YT_NAVIGATE_FINISH, () => {
      if (isMobileYouTube()) {
        // SPA navigations don't refresh window.ytInitialPlayerResponse, so
        // re-run extraction for the new video (falls back to fetching the
        // watch HTML) before retrying the button mount.
        extractAndDispatchVideoData().catch(() => {});
        ensureMobileDownloadButton();
      }
    });

    if (self === top) {
      function cancelAllAndNotify() {
        const videoIds = cancelAllActiveDownloads();
        const hasActiveDownloads = videoIds.length > 0;
        if (hasActiveDownloads) {
          crossWorldMessenger.sendMessage(CrossWorldMessage.CancelDownload, { videoIds }).catch(() => {});
        }
      }

      document.addEventListener(EVENT_YT_NAVIGATE_START, cancelAllAndNotify);
      addEventListener(EVENT_PAGEHIDE, cancelAllAndNotify);
    }

    async function initializeOnLoad() {
      // The isolated world should answer instantly; if it doesn't (e.g. it
      // failed to inject on this page), fall back to defaults rather than
      // hanging forever and never mounting the button.
      const options = await Promise.race([
        crossWorldMessenger.sendMessage(CrossWorldMessage.RequestOptions),
        new Promise<null>(resolve => setTimeout(() => {
          logDiag("warn", "content-main", "RequestOptions timed out; using default options.");
          resolve(null);
        }, 3000))
      ]);
      initContentOptions(options ?? INITIAL_OPTIONS);
      try {
        await extractAndDispatchVideoData();
      } catch (error) {
        logDiag("error", "content-main", `Video-data extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      extractPlaylistMetadata();
      setupAudioTrackWatcher();
      setupCaptionTrackWatcher();
      if (isMobileYouTube()) {
        ensureMobileDownloadButton();
      }
    }

    const isDocumentReady = document.readyState === "complete";
    if (isDocumentReady) {
      initializeOnLoad().catch(() => {});
    } else {
      addEventListener(EVENT_LOAD, () => {
        initializeOnLoad().catch(() => {});
      }, { once: true });
    }
  }
});
