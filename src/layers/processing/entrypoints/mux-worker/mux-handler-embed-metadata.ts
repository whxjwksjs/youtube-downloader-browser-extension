import { buildInputArgs, resolveAudioCodec } from "./mux-ffmpeg-args";
import { postResult, postWorkerLog, state, tryUnlink } from "./mux-state";
import { fetchThumbnail, sanitizeForFFmpeg } from "./mux-thumbnail";
import type { EmbedMetadataJob } from "@/lib/download-pipeline/mux-worker-types";
import { getCompatibleFilename, getFileExtension } from "@/lib/utils/containers";
import type { VideoMetadata } from "@/types";

const STREAM_COVER_EXTENSIONS = new Set(["m4a", "mp3", "flac"]);
// Ogg-family containers reject attached picture streams, but they carry cover
// art through the METADATA_BLOCK_PICTURE vorbis comment (base64 FLAC picture
// block) instead. Verified with real FFmpeg: the tag round-trips and demuxes
// back as an attached picture stream.
const PICTURE_TAG_EXTENSIONS = new Set(["opus", "ogg", "oga"]);
const JPEG_EXTENSION = "jpg";
const FFMPEG_CODEC_MJPEG = "mjpeg";
const COVER_FILENAME_PREFIX = "cover";
const INPUT_FILENAME_PREFIX = "input";
const FLAC_PICTURE_TYPE_FRONT_COVER = 3;
const IMAGE_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

type EmbedContext = {
  inputFilename: string;
  outputFilename: string;
  outputExtension: string;
  audioMimeType: string | undefined;
  metadata: VideoMetadata;
  videoId: string;
};

function canAttachCoverStream(outputExtension: string) {
  return STREAM_COVER_EXTENSIONS.has(outputExtension);
}

function canEmbedPictureTag(outputExtension: string) {
  return PICTURE_TAG_EXTENSIONS.has(outputExtension);
}

function writeBigEndianUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, false);
}

/**
 * Build a FLAC PICTURE block (type 3 = front cover) around the raw image
 * bytes. Width/height/depth are informational and players accept zeros.
 */
function buildFlacPictureBlock(imageData: Uint8Array, mimeType: string) {
  const mimeBytes = new TextEncoder().encode(mimeType);
  const blockSize = 4 + 4 + mimeBytes.length + 4 + 4 * 4 + 4 + imageData.length;
  const block = new Uint8Array(blockSize);
  const view = new DataView(block.buffer);
  let offset = 0;
  writeBigEndianUint32(view, offset, FLAC_PICTURE_TYPE_FRONT_COVER);
  offset += 4;
  writeBigEndianUint32(view, offset, mimeBytes.length);
  offset += 4;
  block.set(mimeBytes, offset);
  offset += mimeBytes.length;
  writeBigEndianUint32(view, offset, 0); // description length (empty)
  offset += 4;
  // width, height, color depth, palette colors — informational, zeros accepted
  for (let i = 0; i < 4; i++) {
    writeBigEndianUint32(view, offset, 0);
    offset += 4;
  }
  writeBigEndianUint32(view, offset, imageData.length);
  offset += 4;
  block.set(imageData, offset);
  return block;
}

function encodeBase64(data: Uint8Array) {
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...data.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
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

async function tryEmbedWithCover({ thumbnail, ...ctx }: EmbedContext & { thumbnail: { data: Uint8Array; extension: string } }) {
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

function tryRemuxWithPictureTag(ctx: EmbedContext, thumbnail: { data: Uint8Array; extension: string }) {
  const mimeType = IMAGE_MIME_TYPES[thumbnail.extension] ?? "image/jpeg";
  const pictureBlock = buildFlacPictureBlock(thumbnail.data, mimeType);
  const pictureTag = encodeBase64(pictureBlock);

  const ffmpegArgs = [
    ...buildInputArgs(ctx.inputFilename),
    "-map", "0:a",
    "-c:a", resolveTargetAudioCodec({ audioMimeType: ctx.audioMimeType, outputExtension: ctx.outputExtension }),
    ...buildMetadataArgs(ctx.metadata, ctx.videoId),
    "-metadata", `METADATA_BLOCK_PICTURE=${pictureTag}`,
    ctx.outputFilename
  ];

  const exitCode = state.ffmpeg!.exec(...ffmpegArgs);
  if (exitCode !== 0) {
    return null;
  }

  return readOutputFile(ctx.outputFilename);
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
    // Attempt 1: embed metadata + cover art as an attached picture stream.
    // Works for m4a/mp3/flac. Ogg-family containers reject attached picture
    // streams; WebM silently drops them.
    const supportsStreamCover = canAttachCoverStream(outputExtension);
    const supportsPictureTag = canEmbedPictureTag(outputExtension);
    let thumbnail: { data: Uint8Array; extension: string } | null = null;
    if ((supportsStreamCover || supportsPictureTag) && thumbnailUrl) {
      thumbnail = await fetchThumbnail(thumbnailUrl);
    }

    const withCover = supportsStreamCover && thumbnail
      ? await tryEmbedWithCover({ ...ctx, thumbnail })
      : null;
    if (supportsStreamCover && thumbnail && !withCover) {
      postWorkerLog("warn", "embed-metadata", `Cover-art pass failed for ${filenameOutput}; retrying without cover art.`);
    }

    // Attempt 2: Ogg-family cover art via METADATA_BLOCK_PICTURE vorbis
    // comment (the only mechanism those containers support).
    const withPictureTag = !withCover && supportsPictureTag && thumbnail
      ? tryRemuxWithPictureTag(ctx, thumbnail)
      : null;
    if (supportsPictureTag && thumbnail && !withPictureTag) {
      postWorkerLog("warn", "embed-metadata", `Picture-tag pass failed for ${filenameOutput}; retrying without cover art.`);
    }

    // Attempt 3: clean remux into the target container with metadata but no
    // cover art. This guarantees the returned bytes always match the file
    // extension, even when cover attachment is unsupported or fails.
    const result = withCover ?? withPictureTag ?? tryRemuxWithoutCover(ctx);

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
