import { logDiag } from "@/lib/diagnostics/diagnostic-log";

// Chromium ignores the `filename` option of `browser.downloads.download` for
// blob: URLs and falls back to the blob UUID as the file name. This guard
// re-asserts our file name via `downloads.onDeterminingFilename`, which runs
// right before the file is written. Firefox honors `filename` directly and
// does not implement `onDeterminingFilename`, so registration is optional.
const pendingFilenames = new Map<string, string>();

export function rememberDownloadFilename(url: string, filename: string) {
  pendingFilenames.set(url, filename);
}

export function registerFilenameGuard() {
  const determiningFilename = browser.downloads?.onDeterminingFilename;
  if (!determiningFilename) {
    logDiag("info", "filename-guard", "onDeterminingFilename unavailable (Firefox path); relying on filename option directly.");
    return;
  }

  determiningFilename.addListener((item, suggest) => {
    const filename = item.url ? pendingFilenames.get(item.url) : undefined;
    if (filename) {
      pendingFilenames.delete(item.url!);
      logDiag("info", "filename-guard", `Re-asserting filename ${filename} (Chromium proposed ${item.filename ?? "unknown"}).`);
      suggest({
        filename,
        conflictAction: "uniquify"
      });
      return;
    }

    suggest();
  });
}
