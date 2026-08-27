import { IntakePublicForm } from "@/components/intake-public-form";
import { SIGNATURE } from "@/lib/brand";
import { publicIntakeItems, resolveIntakeToken } from "@/lib/db";

// The public intake page — a client's first touch of the brand. No login,
// no navigation, no information beyond what the intro says.
export default async function PublicIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveIntakeToken(token);

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-cream px-5 py-10">
      {children}
      <footer className="mt-auto pt-14 font-ui text-sm text-navy">{SIGNATURE}</footer>
    </main>
  );

  if (!resolved || resolved.form.status === "DRAFT") {
    return shell(
      <p className="font-body text-lg text-navy">
        This link isn&apos;t live. Check with whoever sent it to you.
      </p>
    );
  }
  if (resolved.form.status === "CLOSED") {
    return shell(
      <p className="font-body text-lg text-navy">
        This intake has closed — thank you. If you still have something to
        send, reply to Jacob directly.
      </p>
    );
  }

  const items = await publicIntakeItems(resolved);

  return shell(
    <>
      <h1 className="font-display text-4xl leading-tight text-navy">
        {resolved.form.title}
      </h1>
      {resolved.form.intro && (
        <p className="mt-4 font-body text-lg leading-relaxed text-navy/85">
          {resolved.form.intro}
        </p>
      )}
      <IntakePublicForm
        token={token}
        items={items.map((i) => ({
          id: i.id,
          kind: i.kind,
          prompt: i.prompt,
          required: i.required,
          choices: i.choices,
        }))}
      />
    </>
  );
}
