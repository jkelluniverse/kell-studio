// Dev-only object store backing the fake storage adapter, so the browser
// upload flow works locally without R2 credentials. Returns 404 whenever R2
// is configured — production traffic never touches this route, and user
// file bytes never flow through the Next server when R2 is live.
import { NextResponse, type NextRequest } from "next/server";
import { getFakeStorage, r2Configured } from "@/adapters/storage";

export async function GET(req: NextRequest) {
  const fake = getFakeStorage();
  if (r2Configured() || !fake) return new NextResponse(null, { status: 404 });
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
  const fake = getFakeStorage();
  if (r2Configured() || !fake) return new NextResponse(null, { status: 404 });
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const contentType =
    req.nextUrl.searchParams.get("type") ??
    req.headers.get("content-type") ??
    "application/octet-stream";
  const body = new Uint8Array(await req.arrayBuffer());
  fake.store.set(key, { body, contentType });
  return new NextResponse(null, { status: 200 });
}
