import { postProjectMessageAction } from "@/app/(app)/portal-admin-actions";
import { MessageThread } from "@/components/message-thread";
import type { ThreadMessage } from "@/lib/db/portal";

// The internal half of the project thread — same component as the portal,
// bound to the owner's post action.
export function MessagesSection({
  projectId,
  clientName,
  messages,
  ownerUserId,
}: {
  projectId: string;
  clientName: string;
  messages: ThreadMessage[];
  ownerUserId: string;
}) {
  return (
    <div id="messages">
      <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">Messages</h2>
      <MessageThread
        messages={messages}
        viewer="OWNER"
        viewerUserId={ownerUserId}
        post={postProjectMessageAction.bind(null, projectId)}
        placeholder={`Write to ${clientName}…`}
        emptyLine="No messages yet. The client sees this thread in their portal."
      />
    </div>
  );
}
