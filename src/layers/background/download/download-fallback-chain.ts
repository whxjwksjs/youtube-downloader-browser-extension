import { downloadViaCdn } from "./cdn-downloader";
import { rememberDownloadFilename } from "./filename-guard";
import { attemptSabrDownload } from "./sabr-attempt";
import { logDiag } from "@/lib/diagnostics/diagnostic-log";
import { MessageType, sendMessageToTab } from "@/lib/messaging/messaging";
import { getCompatibleFilename } from "@/lib/utils/filename";
import { DownloadType, ProgressType } from "@/types";
import type { DownloadRequest, Prettify } from "@/types";

type TrySabrParams = Prettify<{
  request: DownloadRequest;
  signal: AbortSignal;
  tabId: number;
}>;
export async function trySabr({ request, signal, tabId }: TrySabrParams) {
  try {
    return attemptSabrDownload({
      request,
      signal,
      tabId
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    console.warn("[ytdl:bg] SABR failed, trying CDN:", error);
    await sendMessageToTab(MessageType.UpdateDownloadProgress, {
      videoId: request.videoId,
      progress: 0,
      progressType: ProgressType.Video
    }, tabId);
    return null;
  }
}

type TryCdnParams = Prettify<{
  request: DownloadRequest;
  signal: AbortSignal;
  videoId: string;
  tabId: number;
  partialVideoData?: Uint8Array;
  partialAudioData?: Uint8Array;
}>;
export async function tryCdn({ request, signal, videoId, tabId, partialVideoData, partialAudioData }: TryCdnParams) {
  try {
    return await downloadViaCdn({
      request,
      signal,
      videoId,
      tabId,
      partialVideoData,
      partialAudioData
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    console.warn("[ytdl:bg] CDN failed, trying iframe fallback:", error);
    return null;
  }
}

export async function tryDirectUrlDownload({ request }: {
  request: DownloadRequest;
}) {
  const { type, resolvedAudioUrl, filenameOutput } = request;
  const isAudioOnly = type === DownloadType.Audio;
  const canDirectDownload = isAudioOnly && !!resolvedAudioUrl;
  if (!canDirectDownload) {
    return null;
  }

  try {
    const filename = getCompatibleFilename(filenameOutput);
    rememberDownloadFilename(resolvedAudioUrl, filename);
    const downloadId = await browser.downloads.download({
      url: resolvedAudioUrl,
      filename
    });
    logDiag("info", "download", `Direct URL download started (id ${downloadId}), file ${filename}`);
    return downloadId;
  } catch (error) {
    logDiag("warn", "download", `Direct URL download failed for ${request.videoId}: ${String(error)}`);
    return null;
  }
}
