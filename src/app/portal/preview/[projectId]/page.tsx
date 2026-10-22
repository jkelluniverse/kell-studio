import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalProjectView } from "@/components/portal-project-view";
import { portalProject } from "@/lib/db";
import { requireSession } from "@/lib/session";

// "View as client": the owner's read-only look at exactly what a portal
// session would render — same payload function, same component. Writes
// nothing (not even readAt): a preview must not change what the client's
// own visit will show.
export default async function PortalPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { db } = await requireSession();
  const owner = await db.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, client: { select: { name: true } } },
  });
  if (!owner) notFound();
  const project = await portalProject(db, owner.clientId, projectId);

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-navy/10 bg-navy px-5 py-3 text-cream">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 font-ui text-sm">
          <span>Previewing as {owner.client.name} — read-only</span>
          <Link href={`/projects/${projectId}`} className="shrink-0 underline underline-offset-2">
            Back
          </Link>
        </div>
      </div>
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-6">
        {project ? (
          <PortalProjectView project={project} mode="preview" />
        ) : (
          <p className="font-body text-lg text-navy/80">
            This project is archived, so the portal doesn&apos;t show it.
          </p>
        )}
      </main>
    </>
  );
}
