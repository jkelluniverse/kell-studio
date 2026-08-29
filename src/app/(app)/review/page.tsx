import { ReviewQueue } from "@/components/review-queue";
import { requireScopedDb } from "@/lib/session";

export default async function ReviewPage() {
  const db = await requireScopedDb();
  const facts = await db.fact.findMany({
    where: { status: "PROPOSED" },
    orderBy: { createdAt: "asc" },
    include: {
      project: { select: { name: true, client: { select: { name: true } } } },
      citations: { select: { excerpt: true, captureId: true }, take: 1 },
    },
  });

  return (
    <div>
      <h1 className="font-display text-3xl text-navy">Review</h1>
      <ReviewQueue
        cards={facts.map((f) => ({
          id: f.id,
          body: f.body,
          kind: f.kind,
          projectName: f.project.name,
          clientName: f.project.client.name,
          excerpt: f.citations[0]?.excerpt ?? null,
          captureId: f.citations[0]?.captureId ?? "",
        }))}
      />
    </div>
  );
}
