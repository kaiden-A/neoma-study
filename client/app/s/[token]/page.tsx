import type { Metadata } from "next";

import { PublicNoteView } from "./PublicNoteView";

export const metadata: Metadata = {
  title: "Shared note · Neoma",
  description: "A note shared from Neoma, read-only.",
  robots: { index: false, follow: false },
};

export default async function SharedNotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicNoteView token={token} />;
}
