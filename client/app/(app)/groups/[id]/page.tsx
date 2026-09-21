import { GroupPage } from "@/components/groups/GroupPage";

export default async function GroupRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupPage groupId={id} />;
}
