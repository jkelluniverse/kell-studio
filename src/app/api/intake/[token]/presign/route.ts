import { NextResponse, type NextRequest } from "next/server";
import { getStorage } from "@/adapters/storage";
import {
  presignIntakeUpload,
  resolveIntakeToken,
  DomainRuleError,
  NotFoundError,
} from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`presign:${ip}`, { limit: 30, windowMs: 60_000 })) {
    return NextResponse.json(
      { error: "Too many uploads at once — give it a minute." },
      { status: 429 }
    );
  }

  const { token } = await ctx.params;
  const resolved = await resolveIntakeToken(token);
  if (!resolved) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const body = (await req.json()) as {
      itemId?: string;
      filename?: string;
      mimeType?: string;
      sizeBytes?: number;
    };
    const ticket = await presignIntakeUpload(getStorage(), resolved, {
      itemId: String(body.itemId ?? ""),
      filename: String(body.filename ?? ""),
      mimeType: String(body.mimeType ?? ""),
      sizeBytes: Number(body.sizeBytes ?? 0),
    });
    return NextResponse.json(ticket);
  } catch (err) {
    if (err instanceof DomainRuleError || err instanceof NotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
