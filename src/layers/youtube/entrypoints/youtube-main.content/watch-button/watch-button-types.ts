import { DownloadType, ProgressType } from "@/types";
import type { Prettify } from "@/types";

export type ButtonViewState = Prettify<{
  isDownloading: boolean;
  isDone: boolean;
  isInterrupted: boolean;
  isError: boolean;
  isUnavailable: boolean;
  isPanelOpen: boolean;
  isPanelBelow: boolean;
  downloadProgress: string;
  isProgressNonZero: boolean;
  progressType: ProgressType | "";
  filename: string;
  quality: string;
  isDownloadable: boolean;
  downloadType: DownloadType;
}>;

export const percentFormatter = new Intl.NumberFormat(document.documentElement.lang, {
  style: "percent",
  maximumFractionDigits: 0
});
