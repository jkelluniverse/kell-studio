// Clears a portal session cookie and lands on the portal login. The gate
// sends revoked users here (?ended=1) so their stale cookie dies instead of
// bouncing between pages.
import type { NextRequest } from "next/server";
import { signOut } from "@/auth";

export async function GET(req: NextRequest) {
  const ended = req.nextUrl.searchParams.get("ended") === "1";
  await signOut({ redirectTo: ended ? "/portal/login?ended=1" : "/portal/login" });
}
