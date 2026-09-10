import { z } from "zod";

import { ProjectStatus, TaskPriority, TaskStatus } from "@/lib/generated/prisma/enums";
import { jsonValueSchema } from "@/lib/validation/comment";

/** Design-system token names. A raw colour would break theming. */
export const PROJECT_COLORS = [
  "accent",
  "success",
  "warning",
  "danger",
  "info",
  "neutral",
] as const;

export const projectColorSchema = z.enum(PROJECT_COLORS);

/**
 * Project key — the ASH-42 prefix.
 *
 * Uppercase letters and digits only, 2–6 characters, and it must not start
 * with a digit (so "1A-3" cannot be confused with a number). Uppercased on the
 * way in rather than rejected, because typing it lowercase is not a mistake
 * worth an error message.
 */
export const projectKeySchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(
    z
      .string()
      .min(2, "At least 2 characters")
      .max(6, "At most 6 characters")
      .regex(/^[A-Z][A-Z0-9]*$/, "Letters and digits only, starting with a letter"),
  );

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Give the project a name").max(80, "That name is too long"),
  /** Derived from the name when omitted. */
  key: projectKeySchema.optional(),
  description: z.string().trim().max(2000).optional(),
  color: projectColorSchema.default("accent"),
  icon: z.string().trim().max(40).default("folder-kanban"),
  isPrivate: z.boolean().default(false),
});

export const updateProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  color: projectColorSchema.optional(),
  icon: z.string().trim().max(40).optional(),
  status: z.enum(ProjectStatus).optional(),
  startDate: z.coerce.date().nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  isPrivate: z.boolean().optional(),
});

export const archiveProjectSchema = z.object({ projectId: z.string().uuid() });

// --- sections ---------------------------------------------------------------

export const createSectionSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1, "Name the section").max(60),
});

export const renameSectionSchema = z.object({
  sectionId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
});

export const moveSectionSchema = z.object({
  sectionId: z.string().uuid(),
  toIndex: z.number().int().min(0),
});

export const deleteSectionSchema = z.object({ sectionId: z.string().uuid() });

// --- tasks ------------------------------------------------------------------

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, "A task needs a title").max(500),
  sectionId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  estimateHours: z.coerce.number().min(0).max(9999).nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).max(20).optional(),
  labelIds: z.array(z.string().uuid()).max(20).optional(),
  /** Insert at the top rather than the bottom — quick-add wants this. */
  prepend: z.boolean().optional(),
});

export const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  /**
   * Tiptap JSON plus the plain-text mirror the search vector indexes.
   *
   * Validated as real JSON, not `unknown`: the same hazard as comment bodies —
   * an unvalidated value both skips inspection on the way into JSONB and can
   * reach Prisma as an opaque client reference.
   */
  description: jsonValueSchema.nullable().optional(),
  descriptionText: z.string().max(50_000).nullable().optional(),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  estimateHours: z.coerce.number().min(0).max(9999).nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
});

export const moveTaskSchema = z.object({
  taskId: z.string().uuid(),
  /** Null moves it out of any section (the project's ungrouped area). */
  sectionId: z.string().uuid().nullable(),
  toIndex: z.number().int().min(0),
});

export const setAssigneesSchema = z.object({
  taskId: z.string().uuid(),
  profileIds: z.array(z.string().uuid()).max(20),
});

export const setLabelsSchema = z.object({
  taskId: z.string().uuid(),
  labelIds: z.array(z.string().uuid()).max(20),
});

export const deleteTaskSchema = z.object({ taskId: z.string().uuid() });

export const toggleTaskSchema = z.object({
  taskId: z.string().uuid(),
  done: z.boolean(),
});

/** Bulk actions from the List view's multi-select. */
export const bulkTaskSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(200),
});

export const bulkUpdateSchema = bulkTaskSchema.extend({
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  sectionId: z.string().uuid().nullable().optional(),
  addLabelIds: z.array(z.string().uuid()).max(20).optional(),
  assigneeIds: z.array(z.string().uuid()).max(20).optional(),
});

// --- checklist --------------------------------------------------------------

export const addChecklistItemSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
});

export const toggleChecklistItemSchema = z.object({
  itemId: z.string().uuid(),
  isDone: z.boolean(),
});

export const deleteChecklistItemSchema = z.object({ itemId: z.string().uuid() });

// --- labels -----------------------------------------------------------------

export const createLabelSchema = z.object({
  name: z.string().trim().min(1, "Name the label").max(40),
  color: projectColorSchema.default("neutral"),
});

export const deleteLabelSchema = z.object({ labelId: z.string().uuid() });

// --- search -----------------------------------------------------------------

export const searchTasksSchema = z.object({
  query: z.string().trim().min(1).max(200),
  projectId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
