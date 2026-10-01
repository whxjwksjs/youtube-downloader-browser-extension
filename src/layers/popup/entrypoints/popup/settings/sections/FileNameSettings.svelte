<script lang="ts">
  import folderIcon from "../../icons/folder.svg?raw";
  import type { SlidingSettingsProps } from "../settings-props";
  import SettingsDropDown from "../ui/SettingsDropDown.svelte";
  import SettingsGroup from "../ui/SettingsGroup.svelte";
  import { setOption } from "@/lib/storage/storage";
  import { FilenameTemplate, type FilenameTemplate as FilenameTemplateType } from "@/types";

  const { options, slideDuration }: SlidingSettingsProps = $props();

  const filenameTemplateItems = [
    {
      value: FilenameTemplate.Title,
      label: "Video title",
      description: "Just the video title"
    },
    {
      value: FilenameTemplate.UploaderTitle,
      label: "Channel – Title",
      description: "Channel name first, then the title"
    },
    {
      value: FilenameTemplate.TitleId,
      label: "Title [video ID]",
      description: "Title with the video ID at the end"
    },
    {
      value: FilenameTemplate.UploaderTitleId,
      label: "Channel – Title [video ID]",
      description: "Channel, title and video ID"
    }
  ];

  function filenameTemplateLabel(template: FilenameTemplateType): string {
    return filenameTemplateItems.find(item => item.value === template)?.label ?? "Video title";
  }

  function selectFilenameTemplate(template: FilenameTemplateType): void {
    void setOption({
      key: "filenameTemplate",
      value: template
    });
  }
</script>

<SettingsGroup title="File names">
  <SettingsDropDown
    currentValue={options.filenameTemplate}
    displayValue={filenameTemplateLabel(options.filenameTemplate)}
    items={filenameTemplateItems}
    label="File name style"
    onSelect={selectFilenameTemplate}
    {slideDuration}
    subtitle="Applies to new downloads"
  >
    {#snippet icon()}
      {@html folderIcon}
    {/snippet}
  </SettingsDropDown>
</SettingsGroup>
