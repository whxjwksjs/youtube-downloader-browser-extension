import { buildInputArgs, resolveAudioCodec } from "./mux-ffmpeg-args";
import { postResult, postWorkerLog, state, tryUnlink } from "./mux-state";
import { fetchThumbnail, sanitizeForFFmpeg } from "./mux-thumbnail";
import type { EmbedMetadataJob } from "@/lib/download-pipeline/mux-worker-types";
import { getCompatibleFilename, getFileExtension } from "@/lib/utils/containers";
import type { VideoMetadata } from "@/types";

const COVER_ART_OUTPUT_EXTENSIONS = new Set(["m4a"]);
const JPEG_EXTENSION = "jpg";
const FFMPEG_CODEC_MJPEG = "mjpeg";
const COVER_FILENAME_PREFIX = "cover";
const INPUT_FILENAME_PREFIX = "input";

type EmbedContext = {
  inputFilename: string;
  outputFilename: string;
  outputExtension: string;
  audioMimeType: string | undefined;
  metadata: VideoMetadata;
  videoId: string;
};

function canAttachCoverStream(outputExtension: string) {
  return COVER_ART_OUTPUT_EXTENSIONS.has(outputExtension);
}

function buildMetadataArgs(metadata: VideoMetadata, videoId: string) {
  const args = [
    "-metadata", `title=${sanitizeForFFmpeg(metadata.title)}`,
    "-metadata", `artist=${sanitizeForFFmpeg(metadata.artist)}`,
    "-metadata", `comment=https://www.youtube.com/watch?v=${videoId}`
  ];

  if (metadata.albumArtist) {
    args.push("-metadata", `album_artist=${sanitizeForFFmpeg(metadata.albumArtist)}`);
  }

  if (metadata.album) {
    args.push("-metadata", `album=${sanitizeForFFmpeg(metadata.album)}`);
  }

  if (metadata.genres?.length) {
    args.push("-metadata", `genre=${sanitizeForFFmpeg(metadata.genres.join(", "))}`);
  }

  if (metadata.date) {
    args.push("-metadata", `date=${metadata.date}`);
  }

  return args;
}

function resolveTargetAudioCodec({ audioMimeType, outputExtension }: {
  audioMimeType: string | undefined;
  outputExtension: string;
}) {
  return resolveAudioCodec({
    audioMimeType: audioMimeType ?? "",
    targetExtension: outputExtension
  });
}

async function tryEmbedWithCover({ thumbnailUrl, ...ctx }: EmbedContext & { thumbnailUrl: string }) {
  const thumbnail = await fetchThumbnail(thumbnailUrl);
  if (!thumbnail) {
    return null;
  }

  const coverFilename = `${COVER_FILENAME_PREFIX}.${thumbnail.extension}`;
  state.ffmpeg!.FS.writeFile(coverFilename, thumbnail.data);

  try {
    const ffmpegArgs = [
      ...buildInputArgs(ctx.inputFilename),
      ...buildInputArgs(coverFilename),
      "-map", "0:a",
      "-map", "1",
      "-c:v", coverFilename.endsWith(`.${JPEG_EXTENSION}`) ? "copy" : FFMPEG_CODEC_MJPEG,
      "-disposition:v", "attached_pic",
      "-c:a", resolveTargetAudioCodec({ audioMimeType: ctx.audioMimeType, outputExtension: ctx.outputExtension }),
      ...buildMetadataArgs(ctx.metadata, ctx.videoId),
      ctx.outputFilename
    ];

    const exitCode = state.ffmpeg!.exec(...ffmpegArgs);
    if (exitCode !== 0) {
      return null;
    }

    return readOutputFile(ctx.outputFilename);
  } finally {
    tryUnlink(coverFilename);
  }
}

function tryRemuxWithoutCover(ctx: EmbedContext) {
  const ffmpegArgs = [
    ...buildInputArgs(ctx.inputFilename),
    "-map", "0:a",
    "-c:a", resolveTargetAudioCodec({ audioMimeType: ctx.audioMimeType, outputExtension: ctx.outputExtension }),
    ...buildMetadataArgs(ctx.metadata, ctx.videoId),
    ctx.outputFilename
  ];

  const exitCode = state.ffmpeg!.exec(...ffmpegArgs);
  if (exitCode !== 0) {
    return null;
  }

  return readOutputFile(ctx.outputFilename);
}

function readOutputFile(outputFilename: string) {
  const output = state.ffmpeg!.FS.readFile(outputFilename, { encoding: "binary" });
  const isEmptyOutput = typeof output === "string" || output.byteLength === 0;
  if (isEmptyOutput) {
    return null;
  }

  return output;
}

export async function handleEmbedMetadata(job: EmbedMetadataJob) {
  const { audioData, filenameOutput, sourceExtension, audioMimeType, metadata, thumbnailUrl, videoId, tabId } = job;
  state.currentVideoId = videoId;
  state.currentTabId = tabId;
  const outputExtension = getFileExtension(filenameOutput) || sourceExtension;
  const inputFilename = `${INPUT_FILENAME_PREFIX}.${sourceExtension}`;
  const outputFilename = getCompatibleFilename(filenameOutput);

  state.progressOffset = 0;
  state.progressScale = 1;

  state.ffmpeg!.FS.writeFile(inputFilename, new Uint8Array(audioData));

  const ctx: EmbedContext = {
    inputFilename,
    outputFilename,
    outputExtension,
    audioMimeType,
    metadata,
    videoId
  };

  try {
    // Attempt 1: embed metadata + cover art. Only for .m4a output — other
    // audio containers cannot carry an attached picture stream (or must not,
    // per user request).
    const withCover = canAttachCoverStream(outputExtension) && thumbnailUrl
      ? await tryEmbedWithCover({ ...ctx, thumbnailUrl })
      : null;
    if (canAttachCoverStream(outputExtension) && thumbnailUrl && !withCover) {
      postWorkerLog("warn", "embed-metadata", `Cover-art pass failed for ${filenameOutput}; retrying without cover art.`);
    }

    // Attempt 2: clean remux into the target container with metadata but no
    // cover art. This guarantees the returned bytes always match the file
    // extension, even when cover attachment is unsupported or fails.
    const result = withCover ?? tryRemuxWithoutCover(ctx);

    // Absolute last resort: the untouched source bytes. Only reached when
    // FFmpeg itself cannot remux at all.
    if (!result) {
      postWorkerLog("error", "embed-metadata", `FFmpeg remux failed for ${filenameOutput}; returning unprocessed source bytes.`);
    }
    postResult(result ?? new Uint8Array(audioData));
  } finally {
    tryUnlink(inputFilename);
    tryUnlink(outputFilename);
  }
}
