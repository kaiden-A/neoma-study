import { CoursePage } from "@/components/courses/CoursePage";

export default async function CourseRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CoursePage courseId={id} />;
}
