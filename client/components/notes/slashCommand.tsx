import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import {
  exitSuggestion,
  Suggestion,
  SuggestionPluginKey,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion";

import { SlashMenu, type SlashMenuHandle } from "@/components/notes/SlashMenu";
import { SLASH_ITEMS, type SlashItem } from "@/components/notes/slashItems";

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        allowedPrefixes: null,
        items: ({ query }) => {
          const needle = query.trim().toLowerCase();
          if (!needle) return SLASH_ITEMS;
          return SLASH_ITEMS.filter((item) =>
            `${item.label} ${item.keywords}`.toLowerCase().includes(needle),
          );
        },
        command: ({ editor, range, props }) => {
          props.run(editor, range);
        },
        render: () => {
          let component: ReactRenderer<SlashMenuHandle> | null = null;
          let unmount: (() => void) | null = null;

          return {
            onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
              component = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              unmount = props.mount(component.element);
            },
            onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
              component?.updateProps(props);
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === "Escape") {
                exitSuggestion(props.view, SuggestionPluginKey);
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              unmount?.();
              component?.destroy();
              component = null;
              unmount = null;
            },
          };
        },
      }),
    ];
  },
});
