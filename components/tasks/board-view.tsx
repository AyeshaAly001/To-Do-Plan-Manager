"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { QuickAddCollapsed } from "@/components/tasks/quick-add";
import type { TaskRowTask } from "@/components/tasks/task-row";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/field";
import { moveTask } from "@/lib/tasks/actions";
import {
  DUE_TONE,
  dueState,
  formatDue,
  TASK_PRIORITY_META,
  taskRef,
} from "@/lib/tasks/display";
import { TaskPriority } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";
import type { Member, Section } from "@/components/tasks/task-list";

/** Column id used for tasks that belong to no section. */
const NO_SECTION = "__none__";

type Columns = Record<string, TaskRowTask[]>;

/**
 * Kanban board.
 *
 * Drag state is held locally and committed on drop, because dnd-kit needs a
 * synchronous view of the lists while dragging — waiting on the server between
 * frames would make the card lag the cursor.
 *
 * Accessibility is not optional here. A mouse-only board excludes keyboard and
 * screen-reader users entirely, so this wires dnd-kit's KeyboardSensor (space
 * to lift, arrows to move, space to drop) and supplies announcements, since
 * the default ones say "item 3" with no idea what moved or where.
 */
export function BoardView({
  projectId,
  tasks,
  sections,
  members,
  canEdit,
  nowIso,
  onOpenTask,
}: {
  projectId: string;
  tasks: TaskRowTask[];
  sections: Section[];
  members: Member[];
  canEdit: boolean;
  nowIso: string;
  onOpenTask: (taskId: string) => void;
}) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Server data is the source of truth; `override` holds the in-flight drag so
  // the board can reorder at frame rate.
  const [override, setOverride] = useState<Columns | null>(null);

  const serverColumns = useMemo<Columns>(() => {
    const columns: Columns = { [NO_SECTION]: [] };
    for (const section of sections) columns[section.id] = [];
    for (const task of tasks) {
      const key = task.sectionId ?? NO_SECTION;
      (columns[key] ??= []).push(task);
    }
    return columns;
  }, [tasks, sections]);

  const columns = override ?? serverColumns;

  const columnOrder = useMemo(() => {
    const ids = sections.map((s) => s.id);
    // Only show the catch-all when something is actually in it — an empty
    // "No section" column on every board is clutter.
    if ((columns[NO_SECTION]?.length ?? 0) > 0) ids.push(NO_SECTION);
    return ids;
  }, [sections, columns]);

  const sensors = useSensors(
    // A small distance threshold so a click on a card opens it instead of
    // starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (taskId: string): string | undefined =>
    Object.keys(columns).find((key) => columns[key]!.some((t) => t.id === taskId));

  const activeTask = activeId
    ? Object.values(columns)
        .flat()
        .find((t) => t.id === activeId)
    : undefined;

  const sectionName = (key: string) =>
    key === NO_SECTION ? "No section" : (sections.find((s) => s.id === key)?.name ?? key);

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const task = Object.values(columns)
        .flat()
        .find((t) => t.id === active.id);
      return task ? `Picked up ${task.title}.` : undefined;
    },
    onDragOver: ({ active, over }) => {
      if (!over) return;
      const task = Object.values(columns)
        .flat()
        .find((t) => t.id === active.id);
      const target = findColumn(String(over.id)) ?? String(over.id);
      return task ? `${task.title} is over ${sectionName(target)}.` : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const task = Object.values(columns)
        .flat()
        .find((t) => t.id === active.id);
      if (!task) return;
      if (!over) return `${task.title} was dropped back where it started.`;
      const target = findColumn(String(over.id)) ?? String(over.id);
      const index = columns[target]?.findIndex((t) => t.id === active.id) ?? -1;
      return `${task.title} dropped into ${sectionName(target)} at position ${index + 1}.`;
    },
    onDragCancel: ({ active }) => {
      const task = Object.values(columns)
        .flat()
        .find((t) => t.id === active.id);
      return task ? `Move cancelled. ${task.title} returned to its place.` : undefined;
    },
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setOverride(serverColumns);
  };

  /** Moves the card between columns mid-drag so the gap follows the cursor. */
  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const from = findColumn(String(active.id));
    const to = columns[String(over.id)] ? String(over.id) : findColumn(String(over.id));
    if (!from || !to || from === to) return;

    setOverride((current) => {
      const base = current ?? serverColumns;
      const source = [...(base[from] ?? [])];
      const target = [...(base[to] ?? [])];
      const index = source.findIndex((t) => t.id === active.id);
      if (index === -1) return base;

      const [moved] = source.splice(index, 1);
      const overIndex = target.findIndex((t) => t.id === over.id);
      target.splice(overIndex === -1 ? target.length : overIndex, 0, moved!);

      return { ...base, [from]: source, [to]: target };
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) {
      setOverride(null);
      return;
    }

    const column = findColumn(String(active.id));
    if (!column) {
      setOverride(null);
      return;
    }

    // Reorder within the column, then commit the final index.
    const items = [...(columns[column] ?? [])];
    const fromIndex = items.findIndex((t) => t.id === active.id);
    const overIndex = items.findIndex((t) => t.id === over.id);
    const toIndex = overIndex === -1 ? items.length - 1 : overIndex;

    if (fromIndex !== -1 && fromIndex !== toIndex) {
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved!);
      setOverride({ ...columns, [column]: items });
    }

    setError(undefined);
    start(async () => {
      const result = await moveTask({
        taskId: String(active.id),
        sectionId: column === NO_SECTION ? null : column,
        toIndex: Math.max(0, toIndex),
      });

      if (!result.ok) {
        setError(result.error);
        // Drop the optimistic view so the board snaps back to the truth
        // rather than showing a move that did not happen.
        setOverride(null);
        return;
      }
      // Clearing the override hands control back to server data, which
      // router.refresh() is about to update.
      setOverride(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <FormError message={error} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverride(null);
        }}
      >
        <div className={cn("flex gap-3 overflow-x-auto pb-4", pending && "opacity-90")}>
          {columnOrder.map((key) => (
            <BoardColumn
              key={key}
              id={key}
              name={sectionName(key)}
              wipLimit={sections.find((s) => s.id === key)?.wipLimit ?? null}
              tasks={columns[key] ?? []}
              projectId={projectId}
              members={members}
              canEdit={canEdit}
              now={now}
              onOpenTask={onOpenTask}
            />
          ))}
        </div>

        {/*
          The dragged card follows the cursor in an overlay rather than moving
          in place, so it can carry `.tilt-drag` — the design system's single
          literal 3D transform, which makes the card read as physically lifted.
        */}
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="tilt-drag bg-surface border-border w-72 rounded-[--radius-md] border p-2.5">
              <p className="truncate text-sm font-medium">{activeTask.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function BoardColumn({
  id,
  name,
  wipLimit,
  tasks,
  projectId,
  members,
  canEdit,
  now,
  onOpenTask,
}: {
  id: string;
  name: string;
  wipLimit: number | null;
  tasks: TaskRowTask[];
  projectId: string;
  members: Member[];
  canEdit: boolean;
  now: Date;
  onOpenTask: (taskId: string) => void;
}) {
  // Droppable on the column itself, so an EMPTY column is still a valid
  // target — without this you could never move the last card back.
  const { setNodeRef, isOver } = useDroppable({ id });
  const overLimit = wipLimit != null && tasks.length > wipLimit;

  return (
    <section
      aria-labelledby={`col-${id}`}
      className={cn(
        "bg-surface-2 flex w-72 shrink-0 flex-col rounded-[--radius-lg] p-2",
        // Flat, not glass: a column is a permanent surface, and
        // backdrop-filter on something that scrolls costs frames.
        isOver && "ring-accent/40 ring-2",
      )}
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <h3 id={`col-${id}`} className="font-display flex-1 truncate text-sm font-semibold">
          {name}
        </h3>
        <span className="text-muted text-xs" data-numeric>
          {tasks.length}
          {wipLimit != null && `/${wipLimit}`}
        </span>
      </div>

      {/* A WIP limit warns rather than blocks — it is a signal, not a gate. */}
      {overLimit && (
        <div className="mb-2 px-1">
          <Badge tone="warning">Over WIP limit</Badge>
        </div>
      )}

      <div ref={setNodeRef} className="min-h-24 flex-1 space-y-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <BoardCard
              key={task.id}
              task={task}
              now={now}
              canEdit={canEdit}
              onOpen={onOpenTask}
            />
          ))}
        </SortableContext>
      </div>

      {canEdit && (
        <div className="mt-2">
          <QuickAddCollapsed
            projectId={projectId}
            sectionId={id === NO_SECTION ? null : id}
            members={members}
          />
        </div>
      )}
    </section>
  );
}

function BoardCard({
  task,
  now,
  canEdit,
  onOpen,
}: {
  task: TaskRowTask;
  now: Date;
  canEdit: boolean;
  onOpen: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canEdit,
  });

  const due = dueState(task.dueDate, now, task.completedAt);
  const priority = TASK_PRIORITY_META[task.priority];

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "bg-surface border-border rounded-[--radius-md] border p-2.5",
        "transition-shadow duration-[--dur-fast] ease-[--ease-out]",
        // The original leaves a faint gap while the overlay carries the card.
        isDragging ? "opacity-40" : "elev-rest hover:elev-hover",
      )}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="w-full rounded-[--radius-sm] text-left"
      >
        <p className="text-muted mb-1 text-xs" data-numeric>
          {taskRef(task.project.key, task.number)}
        </p>
        <p className="mb-2 line-clamp-3 text-sm">{task.title}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          {task.priority !== TaskPriority.NONE && (
            <Badge tone={priority.tone}>{priority.label}</Badge>
          )}
          {task.dueDate && <Badge tone={DUE_TONE[due]}>{formatDue(task.dueDate, now)}</Badge>}
          {task.labels.slice(0, 2).map(({ label }) => (
            <Badge key={label.id} tone="neutral">
              {label.name}
            </Badge>
          ))}

          <span className="ml-auto flex -space-x-1.5">
            {task.assignees.slice(0, 3).map(({ profile }) => (
              <Avatar
                key={profile.id}
                src={profile.avatarUrl}
                name={profile.fullName}
                email={profile.email}
                size="sm"
                className="ring-surface ring-2"
              />
            ))}
          </span>
        </div>
      </button>
    </article>
  );
}
