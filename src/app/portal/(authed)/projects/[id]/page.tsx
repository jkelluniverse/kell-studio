import { notFound } from "next/navigation";
import { PortalProjectView } from "@/components/portal-project-view";
import { markThreadRead, portalProject } from "@/lib/db";
import { requirePortalUser } from "@/lib/session";

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, clientId, userId } = await requirePortalUser();
  // Jacob's messages count as read once the client has the thread on screen.
  await markThreadRead(db, id, { role: "CLIENT", clientId });
  const project = await portalProject(db, clientId, id);
  if (!project) notFound();

  return <PortalProjectView project={project} mode="client" viewerUserId={userId} />;
}
