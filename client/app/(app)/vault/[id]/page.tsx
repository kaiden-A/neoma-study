import { NoteEditor } from "@/components/notes/NoteEditor";

export default async function NoteRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoteEditor noteId={id} />;
}
