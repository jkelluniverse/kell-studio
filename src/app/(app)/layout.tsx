import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { NAME_STUDIO } from "@/lib/brand";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center justify-between border-b border-navy/10 px-4 py-3">
        <Link href="/home" className="font-display text-xl text-navy">
          {NAME_STUDIO}
        </Link>
        <nav className="flex items-center gap-4 font-ui text-sm text-navy">
          <Link href="/home" className="hover:text-emerald">
            Home
          </Link>
          <Link href="/clients" className="hover:text-emerald">
            Clients
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-navy/60 hover:text-emerald">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
