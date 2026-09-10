import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export type ActivityEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  diff: unknown;
  createdAt: string;
  actor: {
    id: string;
    fullName: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
};

/**
 * Activity feed, rendered from `ActivityLog`.
 *
 * A server component: it is read-only and has no interaction, so shipping it
 * as client JavaScript would be pure cost.
 *
 * The log stores a field-level diff, which is what makes a precise line
 * possible — "changed status from To do to In progress" rather than a bare
 * "updated". Anything the renderer does not recognise falls back to a readable
 * sentence rather than showing a raw action key.
 */
export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing has happened yet"
        description="Changes to projects and tasks will be recorded here."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-border divide-y">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-2.5 py-2.5">
          {entry.actor ? (
            <Avatar
              src={entry.actor.avatarUrl}
              name={entry.actor.fullName}
              email={entry.actor.email}
              size="sm"
              className="mt-0.5"
            />
          ) : (
            // System actions (cron, webhooks) have no actor.
            <span className="bg-surface-2 text-muted mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[0.625rem]">
              SYS
            </span>
          )}

          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              {entry.actor?.fullName ?? entry.actor?.email ?? "System"}
            </span>{" "}
            <span className="text-muted">{describe(entry)}</span>
          </span>

          <Badge tone="neutral">{entry.entityType}</Badge>

          <time
            dateTime={entry.createdAt}
            className="text-muted shrink-0 text-xs"
            data-numeric
            title={new Date(entry.createdAt).toLocaleString()}
          >
            {new Date(entry.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </time>
        </li>
      ))}
    </ul>
  );
}

/** Turns an action plus its diff into one readable clause. */
function describe(entry: ActivityEntry): string {
  const diff = (entry.diff ?? {}) as Record<string, unknown>;

  const changed = (field: string): string | null => {
    const value = diff[field];
    if (value && typeof value === "object" && "from" in value && "to" in value) {
      const { from, to } = value as { from: unknown; to: unknown };
      return `changed ${humanise(field)} from ${format(from)} to ${format(to)}`;
    }
    return null;
  };

  switch (entry.action) {
    case "created":
      return `created this ${entry.entityType}`;
    case "updated": {
      // Name the fields that changed; "updated 3 fields" is nearly useless.
      const clauses = Object.keys(diff)
        .map(changed)
        .filter((c): c is string => Boolean(c));
      return clauses.length > 0 ? clauses.join(", ") : "made a change";
    }
    case "archived":
      return "archived it";
    case "completed":
      return "completed a task";
    case "reopened":
      return "reopened a task";
    case "moved":
      return "moved a task";
    case "renamed":
      return changed("name") ?? "renamed it";
    case "deleted":
      return typeof diff.title === "string" ? `deleted "${diff.title}"` : "deleted it";
    case "commented":
      return typeof diff.preview === "string" ? `commented: "${diff.preview}"` : "commented";
    case "comment_deleted":
      return "deleted a comment";
    case "attachment_added":
      return typeof diff.filename === "string"
        ? `attached ${diff.filename}`
        : "attached a file";
    case "attachment_removed":
      return typeof diff.filename === "string" ? `removed ${diff.filename}` : "removed a file";
    case "assignees_changed":
      return "changed the assignees";
    case "role_changed":
      return changed("role") ?? "changed a role";
    case "removed":
      return typeof diff.email === "string" ? `removed ${diff.email}` : "removed a member";
    case "joined":
      return "joined the workspace";
    case "bulk_updated":
      return typeof diff.count === "number"
        ? `updated ${diff.count} tasks at once`
        : "updated several tasks";
    case "bulk_deleted":
      return typeof diff.count === "number"
        ? `deleted ${diff.count} tasks at once`
        : "deleted several tasks";
    default:
      // Readable even for an action this renderer has not been taught yet.
      return entry.action.replace(/_/g, " ");
  }
}

function humanise(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .toLowerCase()
    .trim();
}

function format(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "string") {
    // ISO timestamps read badly in a sentence.
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
    return value.length > 40 ? `${value.slice(0, 39)}…` : value;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}
