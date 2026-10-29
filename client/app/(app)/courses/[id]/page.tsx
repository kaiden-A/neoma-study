import { CoursePage } from "@/components/courses/CoursePage";

export default async function CourseRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; discussion?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const discussion = Number(query.discussion);
  return (
    <CoursePage
      key={`${id}:${query.tab ?? ""}:${query.discussion ?? ""}`}
      courseId={id}
      initialTab={query.tab === "announcements" ? "announcements" : "outline"}
      focusDiscussion={
        Number.isFinite(discussion) && discussion > 0 ? discussion : null
      }
    />
  );
}
