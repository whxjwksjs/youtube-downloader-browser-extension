import { startDownload } from "../video/download";
import { buildInitialDownloadState } from "./initial-download-state";
import { CONTENT_OPTIONS } from "@/lib/ui/synced-stores.svelte";
import type { VideoData } from "@/types";

const MOBILE_BUTTON_ID = "ytdl-mobile-download-button";
const MOBILE_STYLES_ID = "ytdl-mobile-download-styles";
const MOBILE_HOSTNAME = "m.youtube.com";

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

export function mountMobileDownloadButton(videoData: VideoData) {
  cleanupMobileDownloadButton();

  if (!videoData.isDownloadable) {
    return;
  }

  injectMobileButtonStyles();

  const elButton = document.createElement("button");
  elButton.id = MOBILE_BUTTON_ID;
  elButton.type = "button";
  elButton.setAttribute("aria-label", "Download video");
  elButton.innerHTML = `${DOWNLOAD_SVG}<span>Download</span>`;
  elButton.addEventListener("click", () => {
    handleMobileDownloadClick(videoData, elButton).catch(() => {});
  });
  document.documentElement.append(elButton);
}
