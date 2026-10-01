import { normalizeLanguageCode, findOriginalAudioFormat } from "./audio-format-helpers";
import { isAudioMimeNativeForContainer } from "@/lib/utils/containers";
import { AudioCodecPreference, AudioTrackLanguageMode } from "@/types";
import type { AdaptiveFormatItem, Prettify } from "@/types";

const FALLBACK_LANGUAGE_CODE = "en";
const OPUS_CODEC_KEYWORD = "opus";
const AAC_CODEC_KEYWORD = "mp4";

type MatchAudioFormatToLanguageParams = Prettify<{
  audioFormats: AdaptiveFormatItem[];
  langCode: string;
}>;
function matchAudioFormatToLanguage({ audioFormats, langCode }: MatchAudioFormatToLanguageParams) {
  return audioFormats.find(format => normalizeLanguageCode(format.audioTrack?.id ?? "") === langCode);
}

type PrependMatchParams = Prettify<{
  audioFormats: AdaptiveFormatItem[];
  match: AdaptiveFormatItem | undefined | null;
}>;
function prependMatch({ audioFormats, match }: PrependMatchParams) {
  return match ? [match, ...audioFormats.filter(format => format !== match)] : [];
}

function matchesCodecPreference(format: AdaptiveFormatItem, codecPreference: AudioCodecPreference) {
  const mimeType = format.mimeType.toLowerCase();
  if (codecPreference === AudioCodecPreference.Opus) {
    return mimeType.includes(OPUS_CODEC_KEYWORD);
  }

  if (codecPreference === AudioCodecPreference.Aac) {
    return mimeType.includes(AAC_CODEC_KEYWORD);
  }

  return true;
}

// Default audio pick used wherever the code previously grabbed `audioFormats[0]`:
// honors the user's codec preference, then falls back to the highest bitrate.
export function pickPreferredAudioFormat(
  audioFormats: AdaptiveFormatItem[],
  codecPreference: AudioCodecPreference = AudioCodecPreference.Opus
) {
  const preferred = audioFormats.filter(format => matchesCodecPreference(format, codecPreference));
  const candidates = preferred.length ? preferred : audioFormats;
  return pickBestByBitrate(candidates);
}

function orderByCodecPreference(
  audioFormats: AdaptiveFormatItem[],
  codecPreference: AudioCodecPreference
) {
  if (codecPreference === AudioCodecPreference.Auto) {
    return audioFormats;
  }

  const preferred = audioFormats.filter(format => matchesCodecPreference(format, codecPreference));
  if (!preferred.length) {
    return audioFormats;
  }

  const preferredSet = new Set(preferred);
  return [...preferred, ...audioFormats.filter(format => !preferredSet.has(format))];
}

type SelectPreferredAudioFormatParams = Prettify<{
  audioFormats: AdaptiveFormatItem[];
  videoMimeType: string;
  languageMode: AudioTrackLanguageMode;
  codecPreference?: AudioCodecPreference;
  locale: string;
  browserLanguage?: string;
  customLanguage?: string;
}>;
export function selectPreferredAudioFormat({
  audioFormats,
  videoMimeType,
  languageMode,
  codecPreference = AudioCodecPreference.Opus,
  locale,
  browserLanguage,
  customLanguage
}: SelectPreferredAudioFormatParams) {
  const hasFormats = audioFormats.length > 0;
  if (!hasFormats) {
    return null;
  }

  const isWebm = videoMimeType.includes("webm");
  const originalTrack = findOriginalAudioFormat(audioFormats);

  let candidates: AdaptiveFormatItem[] = [];
  const isCustomWithLanguage = languageMode === AudioTrackLanguageMode.Custom && customLanguage;
  if (isCustomWithLanguage) {
    const langCode = normalizeLanguageCode(customLanguage);
    const match = matchAudioFormatToLanguage({
      audioFormats,
      langCode
    })
      ?? matchAudioFormatToLanguage({
        audioFormats,
        langCode: FALLBACK_LANGUAGE_CODE
      });
    candidates = prependMatch({
      audioFormats,
      match
    });
  } else {
    const isOriginalLanguageMode = languageMode === AudioTrackLanguageMode.OriginalLanguage;
    if (isOriginalLanguageMode) {
      candidates = prependMatch({
        audioFormats,
        match: originalTrack
      });
    }
  }

  const hasCandidates = candidates.length > 0;
  if (!hasCandidates) {
    const langPriority = [locale, browserLanguage, FALLBACK_LANGUAGE_CODE]
      .filter((lang): lang is string => !!lang);
    for (const lang of langPriority) {
      const match = matchAudioFormatToLanguage({
        audioFormats,
        langCode: normalizeLanguageCode(lang)
      });
      if (match) {
        candidates = prependMatch({
          audioFormats,
          match
        });
        break;
      }
    }
  }

  const isStillNoCandidates = !candidates.length;
  if (isStillNoCandidates) {
    candidates = originalTrack ? prependMatch({
      audioFormats,
      match: originalTrack
    }) : audioFormats;
  }

  const orderedCandidates = orderByCodecPreference(candidates, codecPreference);
  if (isWebm) {
    return orderedCandidates.find(format => format.mimeType.includes("webm")) ?? orderedCandidates[0] ?? null;
  }

  return orderedCandidates[0] ?? null;
}

function pickBestByBitrate(formats: AdaptiveFormatItem[]) {
  return formats.reduce<AdaptiveFormatItem | null>(
    (best, format) => !best || format.bitrate > best.bitrate ? format : best,
    null
  );
}

type AlignAudioFormatToExtensionParams = Prettify<{
  audioFormats: AdaptiveFormatItem[];
  currentFormat: AdaptiveFormatItem | null;
  targetExtension: string;
}>;
export function alignAudioFormatToExtension({
  audioFormats,
  currentFormat,
  targetExtension
}: AlignAudioFormatToExtensionParams) {
  const isCurrentCompatible = currentFormat
    && isAudioMimeNativeForContainer({
      audioMimeType: currentFormat.mimeType,
      targetExtension
    });
  if (isCurrentCompatible) {
    return currentFormat;
  }

  const selectedTrackId = currentFormat?.audioTrack?.id;
  const sameTrackCandidates = selectedTrackId
    ? audioFormats.filter(format => format.audioTrack?.id === selectedTrackId)
    : audioFormats;
  const candidates = sameTrackCandidates.length ? sameTrackCandidates : audioFormats;
  const nativeFormats = candidates.filter(format => isAudioMimeNativeForContainer({
    audioMimeType: format.mimeType,
    targetExtension
  }));

  return pickBestByBitrate(nativeFormats) ?? pickBestByBitrate(candidates) ?? currentFormat;
}
