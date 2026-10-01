<script lang="ts">
  import audioIcon from "../../icons/audio.svg?raw";
  import videoIcon from "../../icons/video.svg?raw";
  import type { SlidingSettingsProps } from "../settings-props";
  import SettingsDropDown from "../ui/SettingsDropDown.svelte";
  import SettingsGroup from "../ui/SettingsGroup.svelte";
  import { setOption } from "@/lib/storage/storage";
  import {
    audioContainers,
    AUTO_EXTENSION,
    AUTO_EXTENSION_LABEL,
    buildFormatGroups,
    videoContainers
  } from "@/lib/utils/containers";
  import { AudioCodecPreference, type AudioCodecPreference as AudioCodecPreferenceType } from "@/types";

  const { options, slideDuration }: SlidingSettingsProps = $props();

  const audioCodecItems = [
    {
      value: AudioCodecPreference.Opus,
      label: "Prefer Opus",
      description: "Best quality for the size — ideal with MKV"
    },
    {
      value: AudioCodecPreference.Aac,
      label: "Prefer AAC",
      description: "Widest compatibility: phones, TVs and editors"
    },
    {
      value: AudioCodecPreference.Auto,
      label: "Automatic",
      description: "Highest bitrate available, any codec"
    }
  ];

  function audioCodecLabel(preference: AudioCodecPreferenceType): string {
    return audioCodecItems.find(item => item.value === preference)?.label ?? "Prefer Opus";
  }

  function selectAudioCodec(preference: AudioCodecPreferenceType): void {
    void setOption({
      key: "audioCodecPreference",
      value: preference
    });
  }

  function shortLabel(extension: string): string {
    return extension === AUTO_EXTENSION ? AUTO_EXTENSION_LABEL : extension.toUpperCase();
  }

  const videoItems = $derived([
    {
      value: AUTO_EXTENSION,
      label: AUTO_EXTENSION_LABEL,
      description: undefined
    },
    ...buildFormatGroups({ allowedExtensions: videoContainers })
      .flatMap(group => group.items)
      .map(item => ({
        value: item.extension,
        label: shortLabel(item.extension),
        description: item.description || undefined
      }))
  ]);

  const audioItems = $derived([
    {
      value: AUTO_EXTENSION,
      label: AUTO_EXTENSION_LABEL,
      description: undefined
    },
    ...buildFormatGroups({ allowedExtensions: audioContainers })
      .flatMap(group => group.items)
      .map(item => ({
        value: item.extension,
        label: shortLabel(item.extension),
        description: item.description || undefined
      }))
  ]);

  function selectVideo(extension: string): void {
    void setOption({
      key: "ext",
      value: {
        ...options.ext,
        video: extension
      }
    });
  }

  function selectAudio(extension: string): void {
    void setOption({
      key: "ext",
      value: {
        ...options.ext,
        audio: extension
      }
    });
  }
</script>

<SettingsGroup title="Format">
  <SettingsDropDown
    currentValue={options.ext.video}
    displayValue={shortLabel(options.ext.video)}
    items={videoItems}
    label="Video container"
    onSelect={selectVideo}
    {slideDuration}
  >
    {#snippet icon()}
      {@html videoIcon}
    {/snippet}
  </SettingsDropDown>

  <SettingsDropDown
    currentValue={options.ext.audio}
    displayValue={shortLabel(options.ext.audio)}
    items={audioItems}
    label="Audio container"
    onSelect={selectAudio}
    {slideDuration}
    subtitle="Used for audio-only downloads"
  >
    {#snippet icon()}
      {@html audioIcon}
    {/snippet}
  </SettingsDropDown>

  <SettingsDropDown
    currentValue={options.audioCodecPreference}
    displayValue={audioCodecLabel(options.audioCodecPreference)}
    items={audioCodecItems}
    label="Audio codec"
    onSelect={selectAudioCodec}
    {slideDuration}
    subtitle="Which audio track to pick when several are available"
  >
    {#snippet icon()}
      {@html audioIcon}
    {/snippet}
  </SettingsDropDown>
</SettingsGroup>
