import Link from "next/link";
import { PortalAuthContinue } from "@/components/portal-auth-continue";
import { NAME_CLIENT_PORTAL } from "@/lib/brand";
import { peekLoginToken } from "@/lib/db";

// KS-06 DECISION: the emailed link lands here and the token is spent by a
// button (a POST), not by the page load. Mail gateways that pre-fetch links
// would otherwise burn a single-use token before the person ever tapped it,
// and the client's first touch of the portal would be a failure. The page
// only peeks at the token to choose its sentence.
export default async function PortalAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? await peekLoginToken(token) : false;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-16">
      <p className="font-ui text-sm text-navy/60">{NAME_CLIENT_PORTAL}</p>
      {valid && token ? (
        <>
          <h1 className="mt-2 font-display text-4xl leading-tight text-navy">
            Almost there.
          </h1>
          <p className="mt-4 font-body text-lg leading-relaxed text-navy/80">
            Tap below to open your portal.
          </p>
          <PortalAuthContinue token={token} />
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-4xl leading-tight text-navy">
            That link won&apos;t open.
          </h1>
          <p className="mt-4 font-body text-lg leading-relaxed text-navy/80">
            Sign-in links work once and expire after fifteen minutes. Ask for a
            fresh one and you&apos;ll be in.
          </p>
          <Link
            href="/portal/login"
            className="mt-8 inline-block self-start rounded bg-emerald px-5 py-3 font-ui text-white"
          >
            Send me a new link
          </Link>
        </>
      )}
    </main>
  );
}
