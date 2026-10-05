"use client";

import { forwardRef, useImperativeHandle } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";

import { SlashCommand } from "@/components/notes/slashCommand";

export interface RichTextEditorHandle {
  insertMarkdown: (markdown: string) => void;
  focus: () => void;
}

interface RichTextEditorProps {
  initialMarkdown: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
}

function BubbleToolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      link: editor.isActive("link"),
    }),
  });

  const toggleLink = () => {
    if (active.link) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const url = window.prompt("Link URL (https://…)");
    if (!url || !/^https?:\/\//i.test(url.trim())) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const tools = [
    { id: "bold", icon: "fa-bold", label: "Bold", on: active.bold, run: () => editor.chain().focus().toggleBold().run() },
    { id: "italic", icon: "fa-italic", label: "Italic", on: active.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { id: "underline", icon: "fa-underline", label: "Underline", on: active.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { id: "strike", icon: "fa-strikethrough", label: "Strikethrough", on: active.strike, run: () => editor.chain().focus().toggleStrike().run() },
    { id: "code", icon: "fa-code", label: "Inline code", on: active.code, run: () => editor.chain().focus().toggleCode().run() },
  ];

  return (
    <div className="nm-bubble" role="toolbar" aria-label="Format selection">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={`nm-bubble-btn${tool.on ? " is-active" : ""}`}
          title={tool.label}
          aria-label={tool.label}
          aria-pressed={tool.on}
          onMouseDown={(event) => event.preventDefault()}
          onClick={tool.run}
        >
          <i className={`fa-solid ${tool.icon}`} aria-hidden="true" />
        </button>
      ))}
      <span className="nm-bubble-sep" />
      <button
        type="button"
        className={`nm-bubble-btn${active.link ? " is-active" : ""}`}
        title={active.link ? "Remove link" : "Add link"}
        aria-label={active.link ? "Remove link" : "Add link"}
        aria-pressed={active.link}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggleLink}
      >
        <i className="fa-solid fa-link" aria-hidden="true" />
      </button>
    </div>
  );
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { initialMarkdown, placeholder, onChange },
  ref,
) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      Markdown.configure({ markedOptions: { breaks: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      SlashCommand,
    ],
    content: initialMarkdown,
    contentType: "markdown",
    editorProps: {
      attributes: {
        id: "note-body",
        class: "nm-md nm-editor-content",
        "aria-label": "Note body",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  });

  useImperativeHandle(
    ref,
    () => ({
      insertMarkdown: (markdown: string) => {
        editor?.chain().focus().insertContent(markdown, { contentType: "markdown" }).run();
      },
      focus: () => editor?.commands.focus(),
    }),
    [editor],
  );

  return (
    <div className="nm-editor">
      {editor ? (
        <BubbleMenu editor={editor} className="nm-bubble-wrap">
          <BubbleToolbar editor={editor} />
        </BubbleMenu>
      ) : null}
      <EditorContent editor={editor} className="nm-editor-body" />
    </div>
  );
});
