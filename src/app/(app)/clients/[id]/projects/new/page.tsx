import { notFound } from "next/navigation";
import { createProjectAction } from "@/app/(app)/actions";
import { ProjectForm } from "@/components/project-form";
import { requireScopedDb } from "@/lib/session";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await requireScopedDb();
  const client = await db.client.findUnique({ where: { id } });
  if (!client) notFound();

  return (
    <div>
      <h1 className="font-display text-3xl text-navy">
        New project for {client.name}
      </h1>
      <div className="mt-6">
        <ProjectForm action={createProjectAction.bind(null, client.id)} />
      </div>
    </div>
  );
}
