import { SIGNATURE } from "@/lib/brand";

// The portal shell: cream, generous, one column. No session needed here —
// the signed-in pages live under (authed), which gates them.
export default function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {children}
      <footer className="mx-auto w-full max-w-xl px-5 pb-10 pt-14 font-ui text-sm text-navy">
        {SIGNATURE}
      </footer>
    </div>
  );
}
