import { startDownload } from "../video/download";
import { videoDataCache } from "../video/video-data";
import { buildInitialDownloadState } from "./initial-download-state";
import { logDiag } from "@/lib/diagnostics/diagnostic-log";
import { CONTENT_OPTIONS } from "@/lib/ui/synced-stores.svelte";
import { DownloadType, type VideoData } from "@/types";

const MOBILE_BUTTON_ID = "ytdl-mobile-download-button";
const MOBILE_STYLES_ID = "ytdl-mobile-download-styles";
const MOBILE_HOSTNAME = "m.youtube.com";
const MOBILE_RETRY_ATTEMPTS = 20;
const MOBILE_RETRY_DELAY_MS = 500;

const MOBILE_BUTTON_CSS = `
#${MOBILE_BUTTON_ID} {
  position: fixed;
  right: 16px;
  bottom: 96px;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  border: none;
  border-radius: 999px;
  background: #f03;
  color: #fff;
  font: 600 14px/1.2 Roboto, Arial, sans-serif;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  cursor: pointer;
}
#${MOBILE_BUTTON_ID}.ytdl-row-mode {
  position: static;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: 400 11px/1.2 Roboto, Arial, sans-serif;
  box-shadow: none;
  z-index: auto;
}
#${MOBILE_BUTTON_ID} svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}
#${MOBILE_BUTTON_ID}:disabled {
  opacity: 0.6;
  cursor: default;
}
`;

const DOWNLOAD_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

export function isMobileYouTube() {
  return location.hostname === MOBILE_HOSTNAME;
}

function injectMobileButtonStyles() {
  if (document.getElementById(MOBILE_STYLES_ID)) {
    return;
  }

  const elStyle = document.createElement("style");
  elStyle.id = MOBILE_STYLES_ID;
  elStyle.textContent = MOBILE_BUTTON_CSS;
  document.head.append(elStyle);
}

export function cleanupMobileDownloadButton() {
  document.getElementById(MOBILE_BUTTON_ID)?.remove();
}

async function handleMobileDownloadClick(videoData: VideoData, elButton: HTMLButtonElement): Promise<void> {
  elButton.disabled = true;
  try {
    const state = buildInitialDownloadState(videoData);
    await startDownload({
      type: state.downloadType,
      videoId: videoData.videoId,
      videoItag: state.videoItag,
      audioItag: state.audioItag,
      audioTrackId: state.audioTrackId,
      filenameOutput: state.filename,
      downloadExtras: CONTENT_OPTIONS.downloadExtras,
      includeAutoDubbing: CONTENT_OPTIONS.includeAutoDubbing
    });
  } finally {
    elButton.disabled = false;
  }
}

function describeMobileDownloadType(downloadType: DownloadType) {
  if (downloadType === DownloadType.Audio) {
    return "Download audio";
  }

  if (downloadType === DownloadType.Video) {
    return "Download video";
  }

  return "Download video + audio";
}

export function mountMobileDownloadButton(videoData: VideoData) {
  cleanupMobileDownloadButton();

  if (!videoData.isDownloadable) {
    logDiag("warn", "mobile-button", `Skipping mobile button: video ${videoData.videoId} not downloadable.`);
    return;
  }

  injectMobileButtonStyles();

  const initialState = buildInitialDownloadState(videoData);
  const buttonLabel = describeMobileDownloadType(initialState.downloadType);

  const elButton = document.createElement("button");
  elButton.id = MOBILE_BUTTON_ID;
  elButton.type = "button";
  elButton.setAttribute("aria-label", buttonLabel);
  elButton.innerHTML = `${DOWNLOAD_SVG}<span>${buttonLabel}</span>`;
  elButton.addEventListener("click", () => {
    handleMobileDownloadClick(videoData, elButton).catch(() => {});
  });

  // Prefer sitting in YouTube's own mobile action row next to the native
  // Download button; fall back to the floating pill when the row isn't found.
  const elNativeDownload = findNativeMobileDownloadButton();
  if (elNativeDownload?.parentElement) {
    elButton.classList.add("ytdl-row-mode");
    elNativeDownload.parentElement.insertBefore(elButton, elNativeDownload.nextSibling);
    logDiag("info", "mobile-button", `Integrated into mobile action row for ${videoData.videoId} (${buttonLabel}).`);
    return;
  }

  document.documentElement.append(elButton);
  logDiag("info", "mobile-button", `Mounted floating fallback button for ${videoData.videoId} (${buttonLabel}); native action row not found.`);
}

function findMobileActionBar() {
  const elBar = document.querySelector<HTMLElement>("ytm-slim-video-action-bar-renderer");
  if (elBar && elBar.offsetParent !== null) {
    return elBar;
  }

  return null;
}

function findNativeMobileDownloadButton() {
  const elBar = findMobileActionBar();
  if (!elBar) {
    return null;
  }

  const elButtons = elBar.querySelectorAll<HTMLElement>("button, ytm-button-renderer");
  for (const elButton of elButtons) {
    const label = (elButton.getAttribute("aria-label") ?? elButton.textContent ?? "").toLowerCase();
    if (label.includes("download")) {
      return elButton;
    }
  }

  return null;
}

/**
 * Fallback mounting loop for m.youtube.com: video-data extraction sometimes
 * lags or fails on mobile (the exact case that hid the button entirely in
 * v2.5.3), so keep retrying against the video-data cache until the button is
 * present or attempts run out.
 */
export function ensureMobileDownloadButton() {
  if (!isMobileYouTube()) {
    return;
  }

  const startVideoId = new URLSearchParams(location.search).get("v");
  logDiag("info", "mobile-button", `Retry loop started for video ${startVideoId ?? "unknown"} (cache has=${startVideoId ? videoDataCache.has(startVideoId) : false}).`);

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    const videoId = new URLSearchParams(location.search).get("v");
    if (videoId && videoDataCache.has(videoId) && !document.getElementById(MOBILE_BUTTON_ID)) {
      mountMobileDownloadButton(videoDataCache.get(videoId)!);
    }

    if (document.getElementById(MOBILE_BUTTON_ID) || attempts >= MOBILE_RETRY_ATTEMPTS) {
      clearInterval(timer);
      if (attempts >= MOBILE_RETRY_ATTEMPTS && !document.getElementById(MOBILE_BUTTON_ID)) {
        logDiag("warn", "mobile-button", `No mobile button after ${MOBILE_RETRY_ATTEMPTS} attempts for video ${videoId ?? "unknown"}.`);
      }
    }
  }, MOBILE_RETRY_DELAY_MS);
}
