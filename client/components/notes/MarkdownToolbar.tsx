"use client";

import {
  indentSelection,
  insertImage,
  insertTable,
  toggleBulletList,
  toggleChecklist,
  toggleHeading,
  toggleOrderedList,
  wrapSelection,
  type MdEdit,
  type MdState,
} from "@/lib/markdown";

export interface MarkdownAction {
  id: string;
  label: string;
  icon?: string;
  text?: string;
  run: (state: MdState) => MdEdit | null;
}

export const MARKDOWN_ACTIONS: MarkdownAction[] = [
  { id: "bold", label: "Bold (Ctrl+B)", icon: "fa-bold", run: (state) => wrapSelection(state, "**") },
  { id: "italic", label: "Italic (Ctrl+I)", icon: "fa-italic", run: (state) => wrapSelection(state, "*") },
  { id: "strike", label: "Strikethrough", icon: "fa-strikethrough", run: (state) => wrapSelection(state, "~~") },
  { id: "h1", label: "Heading 1", text: "H1", run: (state) => toggleHeading(state, 1) },
  { id: "h2", label: "Heading 2", text: "H2", run: (state) => toggleHeading(state, 2) },
  { id: "h3", label: "Heading 3", text: "H3", run: (state) => toggleHeading(state, 3) },
  { id: "bullet", label: "Bullet list", icon: "fa-list-ul", run: toggleBulletList },
  { id: "ordered", label: "Numbered list", icon: "fa-list-ol", run: toggleOrderedList },
  { id: "check", label: "Checklist", icon: "fa-square-check", run: toggleChecklist },
  { id: "table", label: "Table", icon: "fa-table", run: insertTable },
  { id: "image", label: "Image link", icon: "fa-image", run: (state) => insertImage(state) },
  { id: "indent", label: "Indent list", icon: "fa-indent", run: (state) => indentSelection(state) },
  { id: "outdent", label: "Outdent list", icon: "fa-outdent", run: (state) => indentSelection(state, true) },
];

export function MarkdownToolbar({ onAction }: { onAction: (action: MarkdownAction) => void }) {
  return (
    <div className="nm-md-toolbar" role="toolbar" aria-label="Formatting">
      {MARKDOWN_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          className={`nm-md-tool${action.text ? " nm-md-tool--text" : ""}`}
          title={action.label}
          aria-label={action.label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(action)}
        >
          {action.text ? action.text : <i className={`fa-solid ${action.icon}`} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
