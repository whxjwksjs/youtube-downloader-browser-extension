import { getOutputExtension } from "./container-specs";
import { resolveAutoExtension } from "./mime-types";
import { FilenameTemplate } from "@/types";
import type { Options, VideoData } from "@/types";

export function getCompatibleFilename(filename: string) {
  return filename.replaceAll(/[<>:"\\/|?*`]/g, "");
}

export function hasVisibleContent(filename: string) {
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(filename);
}

export function getFileExtension(filename: string) {
  const iDot = filename.lastIndexOf(".");
  const hasDot = iDot !== -1;
  if (!hasDot) {
    return "";
  }

  return filename.slice(iDot + 1);
}

export function splitFilenameAndExtension(filename: string) {
  const iDot = filename.lastIndexOf(".");
  const hasDot = iDot !== -1;
  if (!hasDot) {
    return {
      name: filename,
      extension: ""
    };
  }

  return {
    name: filename.slice(0, iDot),
    extension: filename.slice(iDot + 1)
  };
}

export function resolveFilenameBasename({ videoData, template, titleOverride }: {
  videoData: Pick<VideoData, "title" | "videoId" | "playerResponse">;
  template: FilenameTemplate;
  titleOverride?: string;
}) {
  const rawTitle = (titleOverride || videoData.title || "").trim();
  const title = hasVisibleContent(getCompatibleFilename(rawTitle))
    ? getCompatibleFilename(rawTitle).trim()
    : videoData.videoId;
  const author = (videoData.playerResponse.videoDetails?.author || "").trim();
  const videoIdSuffix = `[${videoData.videoId}]`;

  switch (template) {
    case FilenameTemplate.UploaderTitle:
      return author ? `${author} - ${title}` : title;
    case FilenameTemplate.TitleId:
      return `${title} ${videoIdSuffix}`;
    case FilenameTemplate.UploaderTitleId:
      return author ? `${author} - ${title} ${videoIdSuffix}` : `${title} ${videoIdSuffix}`;
    case FilenameTemplate.Title:
    default:
      return title;
  }
}

export function resolveVideoFilename({ videoData, options, titleOverride }: {
  videoData: VideoData;
  options: Options;
  titleOverride?: string;
}) {
  const [videoFormat = null] = videoData.videoFormats;
  const [audioFormat = null] = videoData.audioFormats;
  const extensionPreference = videoData.isMusic ? options.ext.audio : options.ext.video;
  const defaultFormat = videoData.isMusic ? audioFormat : videoFormat;
  const resolvedExtension = resolveAutoExtension({
    extension: extensionPreference,
    mimeType: defaultFormat?.mimeType ?? "",
    isAudio: videoData.isMusic
  });
  const outputExtension = videoFormat && audioFormat && !videoData.isMusic
    ? getOutputExtension({
      videoMimeType: videoFormat.mimeType,
      audioMimeType: audioFormat.mimeType,
      userExtension: resolvedExtension
    })
    : resolvedExtension;
  const rawTitle = resolveFilenameBasename({
    videoData,
    template: options.filenameTemplate,
    titleOverride
  });
  const sanitized = getCompatibleFilename(rawTitle).trim();
  const title = hasVisibleContent(sanitized) ? sanitized : videoData.videoId;
  return `${title}.${outputExtension}`;
}
