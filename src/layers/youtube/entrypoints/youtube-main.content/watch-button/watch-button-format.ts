import type { ButtonViewState } from "./watch-button-types";
import { DownloadType, ProgressType } from "@/types";

export type { ButtonViewState } from "./watch-button-types";

function describeDownloadType(downloadType: DownloadType) {
  if (downloadType === DownloadType.Audio) {
    return "audio";
  }

  if (downloadType === DownloadType.Video) {
    return "video only";
  }

  return "video + audio";
}

export function buildDownloadTitle(state: ButtonViewState) {
  const {
    isDone, isDownloading, isError, isUnavailable, isInterrupted, isDownloadable, downloadProgress, progressType, downloadType
  } = state;
  const isProcessing = isDownloading && progressType === ProgressType.FFmpeg;
  if (!isDownloadable) {
    return {
      title: "Not downloadable",
      accessibilityText: "Not downloadable"
    };
  }

  if (isUnavailable) {
    return {
      title: "Unavailable",
      accessibilityText: "Video unavailable - may have been removed"
    };
  }

  if (isDone) {
    return {
      title: "Download again",
      accessibilityText: "Download again"
    };
  }

  if (isProcessing) {
    return {
      title: downloadProgress,
      accessibilityText: `${downloadProgress} processed - click to cancel`
    };
  }

  if (isDownloading) {
    return {
      title: downloadProgress,
      accessibilityText: `Stop download - ${downloadProgress} downloaded`
    };
  }

  if (isInterrupted) {
    return {
      title: downloadProgress,
      accessibilityText: `Stop - paused at ${downloadProgress}`
    };
  }

  if (isError) {
    return {
      title: "Retry",
      accessibilityText: "Retry download"
    };
  }

  const typeLabel = describeDownloadType(downloadType);
  return {
    title: `Download ${typeLabel}`,
    accessibilityText: `Download ${typeLabel}`
  };
}

export function buildDownloadTooltip(state: ButtonViewState) {
  const {
    isDone, isDownloading, isError, isUnavailable, isInterrupted, isDownloadable, isProgressNonZero,
    downloadProgress, progressType, filename, quality, downloadType
  } = state;
  if (!isDownloadable) {
    return "";
  }

  if (isUnavailable) {
    return `${quality ? `${filename} - ${quality}` : filename} - unavailable, may have been removed`;
  }

  const isProcessing = isDownloading && progressType === ProgressType.FFmpeg;
  const isPreparingDownload = isDownloading && !isProgressNonZero;
  const isActivelyDownloading = isDownloading && isProgressNonZero;
  const base = quality ? `${filename} - ${quality}` : filename;
  if (isDone) {
    return base;
  }

  if (isError) {
    return `${base} - retry`;
  }

  if (isInterrupted) {
    const hasInterruptedProgress = downloadProgress !== "0%";
    return hasInterruptedProgress
      ? `${base} - paused at ${downloadProgress}`
      : base;
  }

  if (isProcessing) {
    return `${base} - ${downloadProgress} (processing), click to cancel`;
  }

  if (isPreparingDownload) {
    return `${base} - preparing`;
  }

  if (isActivelyDownloading) {
    return `${base} - ${downloadProgress} downloaded`;
  }

  return `${base} - ${describeDownloadType(downloadType)}`;
}
