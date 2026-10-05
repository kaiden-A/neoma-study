import type { Editor, Range } from "@tiptap/core";

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  icon: string;
  badge?: string;
  keywords: string;
  run: (editor: Editor, range: Range) => void;
}

const fromRange = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

function insertImage(editor: Editor, range: Range) {
  const url = window.prompt("Image URL (https://…)");
  const chain = fromRange(editor, range);
  if (url && /^https?:\/\//i.test(url.trim())) {
    chain.setImage({ src: url.trim() }).run();
  } else {
    chain.run();
  }
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "text",
    label: "Text",
    hint: "Plain paragraph",
    icon: "fa-align-left",
    keywords: "paragraph plain body write",
    run: (editor, range) => fromRange(editor, range).setParagraph().run(),
  },
  {
    id: "h1",
    label: "Heading 1",
    hint: "Big section title",
    icon: "fa-heading",
    badge: "1",
    keywords: "title h1 big section",
    run: (editor, range) => fromRange(editor, range).setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "Medium section title",
    icon: "fa-heading",
    badge: "2",
    keywords: "subtitle h2 medium section",
    run: (editor, range) => fromRange(editor, range).setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "Small section title",
    icon: "fa-heading",
    badge: "3",
    keywords: "subtitle h3 small section",
    run: (editor, range) => fromRange(editor, range).setHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "Bullet list",
    hint: "Simple unordered list",
    icon: "fa-list-ul",
    keywords: "unordered list bullets points",
    run: (editor, range) => fromRange(editor, range).toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "Numbered list",
    hint: "List with numbers",
    icon: "fa-list-ol",
    keywords: "ordered numbered list steps 1.",
    run: (editor, range) => fromRange(editor, range).toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "To-do list",
    hint: "Track tasks with checkboxes",
    icon: "fa-square-check",
    keywords: "todo task checkbox checklist",
    run: (editor, range) => fromRange(editor, range).toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Capture a citation",
    icon: "fa-quote-left",
    keywords: "blockquote citation excerpt",
    run: (editor, range) => fromRange(editor, range).toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "Code block",
    hint: "Preformatted code",
    icon: "fa-code",
    keywords: "code pre snippet monospace",
    run: (editor, range) => fromRange(editor, range).toggleCodeBlock().run(),
  },
  {
    id: "table",
    label: "Table",
    hint: "Insert a 3 × 3 table",
    icon: "fa-table",
    keywords: "table grid rows columns",
    run: (editor, range) =>
      fromRange(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "Separate sections",
    icon: "fa-minus",
    keywords: "divider separator horizontal rule hr line",
    run: (editor, range) => fromRange(editor, range).setHorizontalRule().run(),
  },
  {
    id: "image",
    label: "Image",
    hint: "Embed an image link",
    icon: "fa-image",
    keywords: "image picture photo url embed",
    run: insertImage,
  },
  {
    id: "bold",
    label: "Bold",
    hint: "Strong emphasis",
    icon: "fa-bold",
    keywords: "bold strong emphasis",
    run: (editor, range) => fromRange(editor, range).toggleBold().run(),
  },
  {
    id: "italic",
    label: "Italic",
    hint: "Soft emphasis",
    icon: "fa-italic",
    keywords: "italic emphasis em",
    run: (editor, range) => fromRange(editor, range).toggleItalic().run(),
  },
  {
    id: "underline",
    label: "Underline",
    hint: "Underlined text",
    icon: "fa-underline",
    keywords: "underline",
    run: (editor, range) => fromRange(editor, range).toggleUnderline().run(),
  },
  {
    id: "strike",
    label: "Strikethrough",
    hint: "Crossed-out text",
    icon: "fa-strikethrough",
    keywords: "strike strikethrough crossed out",
    run: (editor, range) => fromRange(editor, range).toggleStrike().run(),
  },
];
