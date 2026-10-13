"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
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
  /** Uploads a picture and returns its durable src (`/api/files/<id>/raw`),
   * or null when it failed — the caller owns compression and the toast. */
  uploadImage?: (file: File) => Promise<string | null>;
}

function imageFiles(list: FileList | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.type.startsWith("image/"));
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
  { initialMarkdown, placeholder, onChange, uploadImage },
  ref,
) {
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  function pickImages(target: Editor) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";
    // Attached so every browser (and automation) fires `change` reliably.
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = imageFiles(input.files);
      input.remove();
      if (files.length) void addImages(files, undefined, target);
    });
    input.click();
  }

  async function addImages(files: File[], at?: number, target?: Editor) {
    // Extension options freeze at creation, before the editor instance exists;
    // the slash picker therefore passes the live instance in.
    const instance = target ?? editor;
    if (!instance || !uploadImage) return;
    setUploading((count) => count + files.length);
    let position = at;
    for (const file of files) {
      const src = await uploadImage(file);
      if (!src) continue;
      const attrs = { src, alt: file.name };
      // The trailing paragraph leaves the cursor past the picture; without it
      // the fresh image stays node-selected and the next one replaces it.
      const content = [{ type: "image", attrs }, { type: "paragraph" }];
      if (typeof position === "number") {
        instance.chain().insertContentAt(position, content).run();
        position += 2;
      } else {
        instance.chain().focus().insertContent(content).run();
      }
    }
    setUploading((count) => Math.max(0, count - files.length));
  }

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
      SlashCommand.configure({ onPickImage: pickImages }),
    ],
    content: initialMarkdown,
    contentType: "markdown",
    editorProps: {
      attributes: {
        id: "note-body",
        class: "nm-md nm-editor-content",
        "aria-label": "Note body",
      },
      // A blob:/data: image pasted from elsewhere would die with the page.
      transformPastedHTML: (html) => html.replace(/<img[^>]+src="(?:blob:|data:)[^"]*"[^>]*>/gi, ""),
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length) return false;
        event.preventDefault();
        void addImages(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = imageFiles(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void addImages(files, at);
        return true;
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
    <div
      className={`nm-editor${dragOver ? " is-drop-target" : ""}`}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => setDragOver(false)}
    >
      {editor ? (
        <BubbleMenu editor={editor} className="nm-bubble-wrap">
          <BubbleToolbar editor={editor} />
        </BubbleMenu>
      ) : null}
      <EditorContent editor={editor} className="nm-editor-body" />
      {uploading > 0 ? (
        <p className="nm-editor-uploading" role="status">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
          Uploading {uploading === 1 ? "picture" : `${uploading} pictures`}…
        </p>
      ) : null}
    </div>
  );
});
