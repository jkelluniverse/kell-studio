import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { SIGNATURE } from "@/lib/brand";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <main className="flex min-h-screen flex-col bg-cream px-8 py-12">
      <div className="flex-1">
        {/* Placeholder heading — KS-06 fills this screen. */}
        <h1 className="font-display text-5xl text-navy">Where I Left Off</h1>
        <p className="mt-6 max-w-prose font-body text-navy">
          Nothing here yet. KS-02 adds the schema, KS-03 seeds the three live
          engagements.
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="font-ui text-sm text-emerald underline underline-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
      <footer className="mt-12 font-ui text-sm text-navy">{SIGNATURE}</footer>
    </main>
  );
}
