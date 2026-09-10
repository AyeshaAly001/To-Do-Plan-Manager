"use server";

import { authedAction } from "@/lib/auth/action";
import { prisma } from "@/lib/db/prisma";
import { deriveProjectKey } from "@/lib/projects/key";
import { assertProjectAccess } from "@/lib/projects/access";
import { compareRanks, ranksBetween, rankForIndex } from "@/lib/rank";
import {
  archiveProjectSchema,
  createProjectSchema,
  createSectionSchema,
  deleteSectionSchema,
  moveSectionSchema,
  renameSectionSchema,
  updateProjectSchema,
} from "@/lib/validation/project";

/**
 * The sections a new project starts with.
 *
 * Three, because an empty project with no structure gives people nowhere to
 * put the first task, and because these become the default board columns in
 * Phase 3. They are ordinary sections — renameable and deletable.
 */
const DEFAULT_SECTIONS = ["To do", "In progress", "Done"];

export const createProject = authedAction({
  capability: "project.create",
  schema: createProjectSchema,
  handler: async (input, ctx) => {
    const key = input.key ?? (await deriveProjectKey(input.name, ctx.workspace.workspaceId));
    const sectionRanks = ranksBetween(null, null, DEFAULT_SECTIONS.length);

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          workspaceId: ctx.workspace.workspaceId,
          name: input.name,
          key,
          description: input.description ?? null,
          color: input.color,
          icon: input.icon,
          isPrivate: input.isPrivate,
          ownerId: ctx.user.id,
          sections: {
            create: DEFAULT_SECTIONS.map((name, i) => ({ name, rank: sectionRanks[i]! })),
          },
        },
        select: { id: true, name: true, key: true },
      });

      // A private project whose creator is not a member would be invisible to
      // everyone, including them — so this membership row is not optional.
      if (input.isPrivate) {
        await tx.projectMember.create({
          data: { projectId: created.id, profileId: ctx.user.id },
        });
      }

      return created;
    });

    await ctx.audit({
      entityType: "project",
      entityId: project.id,
      action: "created",
      diff: { name: project.name, key: project.key, isPrivate: input.isPrivate },
    });

    return project;
  },
  revalidate: ["/projects", "/home"],
});

export const updateProject = authedAction({
  capability: "project.update",
  schema: updateProjectSchema,
  handler: async ({ projectId, ...changes }, ctx) => {
    const before = await assertProjectAccess(projectId, ctx.workspace, ctx.user.id);

    // Only send fields that were actually provided: `undefined` means "leave
    // alone" while `null` means "clear it", and Prisma distinguishes them.
    const data = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));

    if (Object.keys(data).length === 0) return before;

    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
      select: { id: true, name: true, key: true, status: true, isPrivate: true },
    });

    // Diff only what actually changed, so the activity feed can render a
    // precise line rather than "updated".
    const diff: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(data)) {
      const previous = (before as Record<string, unknown>)[field];
      if (previous !== value) diff[field] = { from: previous, to: value };
    }

    await ctx.audit({
      entityType: "project",
      entityId: projectId,
      action: "updated",
      diff,
    });

    return updated;
  },
  revalidate: ["/projects"],
});

export const archiveProject = authedAction({
  capability: "project.archive",
  schema: archiveProjectSchema,
  handler: async ({ projectId }, ctx) => {
    const project = await assertProjectAccess(projectId, ctx.workspace, ctx.user.id);

    // Soft delete: tasks, comments and audit history stay intact and the
    // project can be brought back. Hard deletion is a separate capability.
    await prisma.project.update({
      where: { id: projectId },
      data: { archivedAt: new Date() },
    });

    await ctx.audit({
      entityType: "project",
      entityId: projectId,
      action: "archived",
      diff: { name: project.name },
    });

    return { projectId };
  },
  revalidate: ["/projects", "/home"],
});

// --- sections ---------------------------------------------------------------

export const createSection = authedAction({
  capability: "project.update",
  schema: createSectionSchema,
  handler: async ({ projectId, name }, ctx) => {
    await assertProjectAccess(projectId, ctx.workspace, ctx.user.id);

    const last = await prisma.section.findFirst({
      where: { projectId },
      orderBy: { rank: "desc" },
      select: { rank: true },
    });

    const section = await prisma.section.create({
      data: {
        projectId,
        name,
        rank: rankForIndex(last ? [last.rank] : [], last ? 1 : 0),
      },
      select: { id: true, name: true, rank: true },
    });

    await ctx.audit({
      entityType: "section",
      entityId: section.id,
      action: "created",
      diff: { name, projectId },
    });

    return section;
  },
});

export const renameSection = authedAction({
  capability: "project.update",
  schema: renameSectionSchema,
  handler: async ({ sectionId, name }, ctx) => {
    const section = await prisma.section.findFirst({
      where: { id: sectionId },
      select: { id: true, name: true, projectId: true },
    });
    if (!section) throw new Error("Section not found");
    await assertProjectAccess(section.projectId, ctx.workspace, ctx.user.id);

    await prisma.section.update({ where: { id: sectionId }, data: { name } });

    await ctx.audit({
      entityType: "section",
      entityId: sectionId,
      action: "renamed",
      diff: { name: { from: section.name, to: name } },
    });

    return { sectionId, name };
  },
});

export const moveSection = authedAction({
  capability: "project.update",
  schema: moveSectionSchema,
  handler: async ({ sectionId, toIndex }, ctx) => {
    const section = await prisma.section.findFirst({
      where: { id: sectionId },
      select: { id: true, projectId: true },
    });
    if (!section) throw new Error("Section not found");
    await assertProjectAccess(section.projectId, ctx.workspace, ctx.user.id);

    const siblings = await prisma.section.findMany({
      where: { projectId: section.projectId, id: { not: sectionId } },
      select: { rank: true },
    });

    // One row updated regardless of list length — the point of fractional
    // ranking.
    const rank = rankForIndex(siblings.map((s) => s.rank).sort(compareRanks), toIndex);
    await prisma.section.update({ where: { id: sectionId }, data: { rank } });

    return { sectionId, rank };
  },
});

export const deleteSection = authedAction({
  capability: "project.update",
  schema: deleteSectionSchema,
  handler: async ({ sectionId }, ctx) => {
    const section = await prisma.section.findFirst({
      where: { id: sectionId },
      select: { id: true, name: true, projectId: true, _count: { select: { tasks: true } } },
    });
    if (!section) throw new Error("Section not found");
    await assertProjectAccess(section.projectId, ctx.workspace, ctx.user.id);

    // Tasks survive: the FK is SetNull, so they fall back to the project's
    // ungrouped area rather than being deleted along with the container.
    // Deleting someone's work as a side effect of tidying columns would be
    // indefensible.
    await prisma.section.delete({ where: { id: sectionId } });

    await ctx.audit({
      entityType: "section",
      entityId: sectionId,
      action: "deleted",
      diff: { name: section.name, tasksOrphaned: section._count.tasks },
    });

    return { sectionId, tasksOrphaned: section._count.tasks };
  },
});
