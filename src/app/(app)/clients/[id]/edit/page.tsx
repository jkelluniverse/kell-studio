import { notFound } from "next/navigation";
import { updateClientAction } from "@/app/(app)/actions";
import { ClientForm } from "@/components/client-form";
import { requireScopedDb } from "@/lib/session";

export default async function EditClientPage({
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
      <h1 className="font-display text-3xl text-navy">Edit {client.name}</h1>
      <div className="mt-6">
        <ClientForm
          action={updateClientAction.bind(null, client.id)}
          initial={{
            name: client.name,
            slug: client.slug,
            status: client.status,
            contactName: client.contactName ?? undefined,
            contactEmail: client.contactEmail ?? undefined,
            contactPhone: client.contactPhone ?? undefined,
            notes: client.notes ?? undefined,
          }}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}
