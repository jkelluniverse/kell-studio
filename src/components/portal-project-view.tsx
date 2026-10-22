import { portalPostMessageAction } from "@/app/portal/portal-actions";
import { MessageThread } from "@/components/message-thread";
import { PortalFiles } from "@/components/portal-files";
import { NAME_OWNER } from "@/lib/brand";
import type { PortalProjectPayload } from "@/lib/db/portal";
import { fmtDate } from "@/lib/format";

// The project workspace, in the order a client reads it: where things
// stand, what's on them, their files, the conversation. Rendered by the
// real client session and by the owner's read-only preview from the same
// payload — the preview can't show anything the client wouldn't see.
export function PortalProjectView({
  project,
  mode,
  viewerUserId,
}: {
  project: PortalProjectPayload;
  mode: "client" | "preview";
  viewerUserId?: string;
}) {
  const readOnly = mode === "preview";

  return (
    <div>
      <p className="font-ui text-sm text-navy/60">{project.clientName}</p>
      <h1 className="mt-1 font-display text-4xl leading-tight text-navy">{project.name}</h1>
      <p className="mt-3 font-body text-lg text-navy/80">
        {project.progress}
        {project.status !== "ACTIVE" && (
          <span className="ml-2 rounded-full border border-navy/20 px-2 py-0.5 font-ui text-xs text-navy/70">
            {project.statusLabel}
          </span>
        )}
      </p>

      <section className="mt-10">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">Progress</h2>
        {project.phases.length === 0 ? (
          <p className="mt-3 font-body text-navy/70">
            The build stages will show up here as soon as they&apos;re set.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col">
            {project.phases.map((phase, i) => {
              const last = i === project.phases.length - 1;
              const marker =
                phase.status === "DONE"
                  ? "bg-navy border-navy text-cream"
                  : phase.current
                    ? "bg-emerald border-emerald text-white"
                    : "bg-transparent border-navy/30 text-transparent";
              return (
                <li key={phase.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 font-ui text-xs ${marker}`}
                    >
                      {phase.status === "DONE" ? "✓" : "●"}
                    </span>
                    {!last && <span className="w-0.5 flex-1 bg-navy/15" aria-hidden />}
                  </div>
                  <div className={`${last ? "pb-0" : "pb-6"} min-w-0`}>
                    <p
                      className={`font-display leading-snug ${
                        phase.current ? "text-2xl text-navy" : "text-lg text-navy/80"
                      }`}
                    >
                      {phase.name}
                    </p>
                    <p
                      className={`mt-0.5 font-ui text-sm ${
                        phase.status === "WAITING"
                          ? "text-rust"
                          : phase.current
                            ? "text-emerald"
                            : "text-navy/50"
                      }`}
                    >
                      {phase.label}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">
          Your action items
        </h2>
        {project.actionItems.length === 0 ? (
          <p className="mt-3 font-body text-navy/70">Nothing on your plate right now.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {project.actionItems.map((item) => (
              <li key={item.id} className="rounded-lg border border-navy/15 bg-white/60 p-4">
                <p className="font-body text-navy">{item.title}</p>
                <p className="mt-1 font-ui text-xs text-navy/60">
                  Due {fmtDate(item.dueOn)} · {item.phaseName}
                </p>
                {item.note && (
                  <p className="mt-2 font-body text-sm text-navy/70">{item.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" id="files">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">Files</h2>
        <PortalFiles projectId={project.id} files={project.files} readOnly={readOnly} />
      </section>

      <section className="mt-10" id="messages">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">Messages</h2>
        <MessageThread
          messages={project.messages}
          viewer="CLIENT"
          viewerUserId={viewerUserId}
          post={readOnly ? undefined : portalPostMessageAction.bind(null, project.id)}
          placeholder={`Write to ${NAME_OWNER}…`}
          emptyLine={`No messages yet. Anything you write here goes straight to ${NAME_OWNER}.`}
          readOnly={readOnly}
        />
      </section>
    </div>
  );
}
