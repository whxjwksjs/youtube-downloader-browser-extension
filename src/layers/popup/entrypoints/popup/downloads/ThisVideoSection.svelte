<script lang="ts">
  import { MessageType, sendMessageToTab } from "@/lib/messaging/messaging";
  import type { VideoDetail } from "@/types";

  interface Props {
    videoDetails: Record<string, VideoDetail>;
    currentTabId?: number;
    currentSourceUrl?: string;
  }

  const { videoDetails, currentTabId, currentSourceUrl }: Props = $props();

  const MAX_REFRESH_ATTEMPTS = 3;
  let refreshAttempts = $state(0);
  let gaveUp = $state(false);

  function extractVideoId(url: string): string | null {
    try {
      const parsed = new URL(url);
      const isYouTubeHost = /(^|\.)youtube\.com$/.test(parsed.hostname) || parsed.hostname === "youtu.be";
      if (!isYouTubeHost) {
        return null;
      }

      if (parsed.hostname === "youtu.be") {
        return parsed.pathname.slice(1) || null;
      }

      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      return parsed.pathname.match(/^\/shorts\/([^/?]+)/)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  const videoId = $derived(currentSourceUrl ? extractVideoId(currentSourceUrl) : null);
  const detail = $derived(videoId ? videoDetails[videoId] : undefined);

  // The popup can open while the tab's video-data capture is still in
  // flight. Ask the tab to re-run extraction and re-dispatch its data
  // instead of silently hiding the section.
  $effect(() => {
    if (!videoId || detail || gaveUp || refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
      return;
    }

    const attempt = refreshAttempts + 1;
    const timer = setTimeout(() => {
      refreshAttempts = attempt;
      if (currentTabId !== undefined) {
        sendMessageToTab(MessageType.RequestVideoDataRefresh, undefined, currentTabId).catch(() => {});
      }

      if (attempt >= MAX_REFRESH_ATTEMPTS) {
        gaveUp = true;
      }
    }, 900 * attempt);
    return () => clearTimeout(timer);
  });

  async function handleDownload(): Promise<void> {
    if (!videoId || currentTabId === undefined) {
      return;
    }

    await sendMessageToTab(MessageType.RequestPageDownload, { videoId }, currentTabId).catch(() => {});
  }

  async function handleRetry(): Promise<void> {
    refreshAttempts = 0;
    gaveUp = false;
  }
</script>

{#if videoId}
  <section class="this-video">
    {#if detail}
      <div class="this-video-info">
        <span class="this-video-label">This video</span>
        <span class="this-video-title">{detail.title || videoId}</span>
        {#if detail.channel}
          <span class="this-video-channel">{detail.channel}</span>
        {/if}
      </div>
      <button class="this-video-button" onclick={handleDownload} type="button">
        Download
      </button>
    {:else if gaveUp}
      <div class="this-video-info">
        <span class="this-video-label">This video</span>
        <span class="this-video-title">Couldn't load video info</span>
      </div>
      <button class="this-video-button" onclick={handleRetry} type="button">
        Retry
      </button>
    {:else}
      <div class="this-video-info">
        <span class="this-video-label">This video</span>
        <span class="this-video-title">Loading video info…</span>
      </div>
    {/if}
  </section>
{/if}

<style>
  .this-video {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
  }

  .this-video-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .this-video-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.6;
  }

  .this-video-title {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .this-video-channel {
    font-size: 12px;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .this-video-button {
    flex-shrink: 0;
    padding: 8px 16px;
    border: none;
    border-radius: 999px;
    background: #f03;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
