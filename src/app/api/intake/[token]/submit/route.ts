import { NextResponse, type NextRequest } from "next/server";
import { getEmail } from "@/adapters/email";
import {
  resolveIntakeToken,
  submitIntake,
  DomainRuleError,
  NotFoundError,
} from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`submit:${ip}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json(
      { error: "Too many submissions — give it a minute." },
      { status: 429 }
    );
  }

  const { token } = await ctx.params;
  const resolved = await resolveIntakeToken(token);
  if (!resolved) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const body = await req.json();
    await submitIntake(
      resolved,
      {
        email: getEmail(),
        appBaseUrl: process.env.AUTH_URL ?? req.nextUrl.origin,
        ownerEmail: process.env.OWNER_EMAIL,
      },
      {
        respondentName: body.respondentName,
        respondentEmail: body.respondentEmail,
        website: body.website,
        answers: Array.isArray(body.answers) ? body.answers : [],
        files: Array.isArray(body.files) ? body.files : [],
      }
    );
    // Honeypot hits also land here — indistinguishable 200, nothing written.
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DomainRuleError || err instanceof NotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
