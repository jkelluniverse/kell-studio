// Dev-only object store backing the fake storage adapter, so the browser
// upload flow works locally (next dev) without R2 credentials. Unreachable
// in production regardless of R2 config: any Railway environment or a
// production NODE_ENV gets an unconditional 404 before the adapter is even
// consulted — user file bytes never flow through the Next server outside
// local development. Belt and braces: the R2-configured guard stays too.
import { NextResponse, type NextRequest } from "next/server";
import { getFakeStorage, r2Configured } from "@/adapters/storage";
import { assertUploadAllowed, DomainRuleError } from "@/lib/db";

function blocked(): boolean {
  return (
    Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) ||
    process.env.NODE_ENV === "production" ||
    r2Configured()
  );
}

export async function GET(req: NextRequest) {
  if (blocked()) return new NextResponse(null, { status: 404 });
  const fake = getFakeStorage();
  if (!fake) return new NextResponse(null, { status: 404 });
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const entry = fake.store.get(key);
  if (!entry) return new NextResponse(null, { status: 404 });
  const headers: Record<string, string> = { "Content-Type": entry.contentType };
  if (req.nextUrl.searchParams.get("download")) {
    const filename = req.nextUrl.searchParams.get("filename") ?? "download";
    headers["Content-Disposition"] = `attachment; filename="${filename.replace(/"/g, "")}"`;
  }
  return new NextResponse(Buffer.from(entry.body), { headers });
}

export async function PUT(req: NextRequest) {
  if (blocked()) return new NextResponse(null, { status: 404 });
  const fake = getFakeStorage();
  if (!fake) return new NextResponse(null, { status: 404 });
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const contentType =
    req.nextUrl.searchParams.get("type") ??
    req.headers.get("content-type") ??
    "application/octet-stream";
  const body = new Uint8Array(await req.arrayBuffer());
  // Dev-only route or not, it enforces the same allowlist and size cap the
  // presign path does — local behavior matches production behavior exactly.
  try {
    assertUploadAllowed(contentType, body.byteLength);
  } catch (err) {
    if (err instanceof DomainRuleError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  fake.store.set(key, { body, contentType });
  return new NextResponse(null, { status: 200 });
}
