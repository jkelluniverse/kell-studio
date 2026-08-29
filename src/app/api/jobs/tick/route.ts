// The pipeline heartbeat. Hit by Railway cron (and opportunistically after
// captures are created) — idempotent, cheap when there's no work, safe
// under double-fire (see the claim guards in src/lib/db/captures.ts).
// When CRON_SECRET is set, requests must carry it; unset means open (dev).
import { NextResponse, type NextRequest } from "next/server";
import { getStorage } from "@/adapters/storage";
import { getTranscription } from "@/adapters/transcription";
import { getAI } from "@/adapters/ai";
import { tick } from "@/lib/db";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret) {
    return new NextResponse(null, { status: 404 });
  }
  const result = await tick({
    storage: getStorage(),
    transcription: getTranscription(),
    ai: getAI(),
  });
  return NextResponse.json({ ok: true, processed: result.processed });
}
