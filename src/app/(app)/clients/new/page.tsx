import { createClientAction } from "@/app/(app)/actions";
import { ClientForm } from "@/components/client-form";

export default function NewClientPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-navy">New client</h1>
      <div className="mt-6">
        <ClientForm action={createClientAction} submitLabel="Create client" />
      </div>
    </div>
  );
}
