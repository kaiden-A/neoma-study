import type { Metadata } from "next";

// One source of truth for everything that ends up in <head>, the sitemap and
// robots.txt. NEXT_PUBLIC_SITE_URL wins; on Vercel the production deployment
// URL is a safe fallback; local dev falls back to the dev server.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    const trimmed = explicit.replace(/\/+$/, "");
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "Neoma";
export const SITE_TITLE = "Neoma · Study OS";
export const SITE_DESCRIPTION =
  "Neoma is a study OS for IIUM students: group project boards, shared notes, PDFs and lectures beside your writing, iTa'leem sync and one calendar.";

export const SITE_KEYWORDS = [
  "Neoma",
  "study app",
  "study OS",
  "student planner",
  "group project task board",
  "shared study notes",
  "IIUM",
  "iTa'leem",
  "Moodle",
  "flashcards",
  "spaced repetition",
  "Google Calendar sync",
];

export const OG_IMAGE = {
  url: "/og/neoma-og.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Neoma · Study OS — one place for the group project, the lecture notes, and the exam.",
};

type PageMetaInput = {
  title: string;
  description: string;
  path: `/${string}`;
  /** Skip the "%s · Neoma" template (used by the home page). */
  absoluteTitle?: boolean;
};

// Next merges metadata shallowly: a page that sets `openGraph` replaces the
// whole object, including the image. Building the complete block here keeps
// every public page shareable.
export function pageMeta({
  title,
  description,
  path,
  absoluteTitle = false,
}: PageMetaInput): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_MY",
      url: path,
      title,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: OG_IMAGE.url,
          alt: OG_IMAGE.alt,
          width: OG_IMAGE.width,
          height: OG_IMAGE.height,
          type: OG_IMAGE.type,
        },
      ],
    },
  };
}
