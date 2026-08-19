import { NextResponse } from "next/server";
import { dbHealthy } from "@/lib/db/health";

export async function GET() {
  const db = await dbHealthy();
  if (!db) {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true, db: true });
}
