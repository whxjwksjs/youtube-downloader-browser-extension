<script lang="ts">
  import SettingsGroup from "../ui/SettingsGroup.svelte";
  import { formatLogEntry, type DiagnosticLogEntry } from "@/lib/diagnostics/diagnostic-log";
  import { MessageType, sendMessage } from "@/lib/messaging/messaging";

  let entries = $state<DiagnosticLogEntry[]>([]);
  let isLoading = $state(false);
  let statusMessage = $state("");

  async function refreshLog() {
    isLoading = true;
    statusMessage = "";
    try {
      entries = (await sendMessage(MessageType.GetDiagnosticLog)) ?? [];
    } catch {
      statusMessage = "Could not read the log.";
    } finally {
      isLoading = false;
    }
  }

  function buildLogText() {
    return entries.map(formatLogEntry).join("\n");
  }

  async function copyLog() {
    statusMessage = "";
    try {
      await navigator.clipboard.writeText(buildLogText());
      statusMessage = "Copied to clipboard.";
    } catch {
      statusMessage = "Copy failed.";
    }
  }

  function exportLog() {
    statusMessage = "";
    const blob = new Blob([buildLogText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ytdl-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    statusMessage = "Exported.";
  }

  async function clearLog() {
    statusMessage = "";
    try {
      await sendMessage(MessageType.ClearDiagnosticLog);
      entries = [];
      statusMessage = "Log cleared.";
    } catch {
      statusMessage = "Clear failed.";
    }
  }

  $effect(() => {
    void refreshLog();
  });
</script>

<SettingsGroup title="Diagnostics">
  <p class="hint">
    Recent extension activity. Copy or export this log and send it when reporting a problem.
    Tokens and private URL parameters are redacted automatically.
  </p>
  <div class="log-box" aria-live="polite">
    {#if isLoading}
      <span class="log-empty">Loading…</span>
    {:else if entries.length === 0}
      <span class="log-empty">No log entries yet. Download something or retry the failing step, then refresh.</span>
    {:else}
      {#each entries as entry, index (index)}
        <div class="log-line log-{entry.level}">{formatLogEntry(entry)}</div>
      {/each}
    {/if}
  </div>
  <div class="button-row">
    <button type="button" class="diag-button" onclick={refreshLog}>Refresh</button>
    <button type="button" class="diag-button" onclick={copyLog} disabled={entries.length === 0}>Copy</button>
    <button type="button" class="diag-button" onclick={exportLog} disabled={entries.length === 0}>Export</button>
    <button type="button" class="diag-button" onclick={clearLog} disabled={entries.length === 0}>Clear</button>
  </div>
  {#if statusMessage}
    <p class="status">{statusMessage}</p>
  {/if}
</SettingsGroup>

<style>
  .hint {
    margin: 0 0 8px;
    font-size: 12px;
    opacity: 0.75;
  }

  .log-box {
    max-height: 220px;
    overflow-y: auto;
    padding: 8px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 6px;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .log-empty {
    opacity: 0.6;
  }

  .log-line {
    margin-bottom: 2px;
  }

  .log-warn {
    color: #b45309;
  }

  .log-error {
    color: #dc2626;
  }

  .button-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .diag-button {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid rgba(128, 128, 128, 0.4);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
  }

  .diag-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .status {
    margin: 6px 0 0;
    font-size: 12px;
    opacity: 0.75;
  }
</style>
