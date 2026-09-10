-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'accent',
    "icon" TEXT NOT NULL DEFAULT 'folder-kanban',
    "status" "project_status" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE,
    "target_date" DATE,
    "owner_id" UUID NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "task_counter" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rank" TEXT NOT NULL,
    "wip_limit" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "section_id" UUID,
    "number" INTEGER NOT NULL,
    "parent_task_id" UUID,
    "title" TEXT NOT NULL,
    "description" JSONB,
    "description_text" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "priority" "task_priority" NOT NULL DEFAULT 'NONE',
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "estimate_hours" DECIMAL(6,2),
    "rank" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "search_vector" tsvector,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'neutral',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_labels" (
    "task_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("task_id","label_id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "rank" TEXT NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_workspace_id_status_idx" ON "projects"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_key_key" ON "projects"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "project_members_profile_id_idx" ON "project_members"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_profile_id_key" ON "project_members"("project_id", "profile_id");

-- CreateIndex
CREATE INDEX "sections_project_id_idx" ON "sections"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_project_id_rank_key" ON "sections"("project_id", "rank");

-- CreateIndex
CREATE INDEX "tasks_project_id_rank_idx" ON "tasks"("project_id", "rank");

-- CreateIndex
CREATE INDEX "tasks_project_id_status_idx" ON "tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks"("parent_task_id");

-- CreateIndex
CREATE INDEX "tasks_section_id_idx" ON "tasks"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_project_id_number_key" ON "tasks"("project_id", "number");

-- CreateIndex
CREATE INDEX "task_assignees_profile_id_idx" ON "task_assignees"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignees_task_id_profile_id_key" ON "task_assignees"("task_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "labels_workspace_id_name_key" ON "labels"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "task_labels_label_id_idx" ON "task_labels"("label_id");

-- CreateIndex
CREATE INDEX "checklist_items_task_id_rank_idx" ON "checklist_items"("task_id", "rank");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Row Level Security: deny-all on the new tables
-- ---------------------------------------------------------------------------
-- Same reasoning as Phase 1: Prisma connects as the table owner and bypasses
-- RLS, authorization lives in lib/auth/action.ts, and this exists so a leaked
-- publishable key can read nothing. Revoking grants additionally keeps these
-- tables off the PostgREST surface entirely.
--
-- `npm run verify:security` fails if any public table is missed.
-- ===========================================================================

ALTER TABLE "projects"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sections"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_assignees"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "labels"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_labels"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "projects"        FROM anon, authenticated;
REVOKE ALL ON "project_members" FROM anon, authenticated;
REVOKE ALL ON "sections"        FROM anon, authenticated;
REVOKE ALL ON "tasks"           FROM anon, authenticated;
REVOKE ALL ON "task_assignees"  FROM anon, authenticated;
REVOKE ALL ON "labels"          FROM anon, authenticated;
REVOKE ALL ON "task_labels"     FROM anon, authenticated;
REVOKE ALL ON "checklist_items" FROM anon, authenticated;

-- ===========================================================================
-- Full-text search over tasks
-- ---------------------------------------------------------------------------
-- `tasks.search_vector` is declared Unsupported("tsvector") in schema.prisma,
-- so Prisma creates the column but otherwise leaves it alone. It is maintained
-- by a trigger rather than a GENERATED column because Prisma's differ does not
-- model generated expressions and would try to rewrite the column.
--
-- Weighting: the title is what people actually search for, so it ranks above
-- the description body. `description_text` is the plain-text mirror the app
-- writes alongside the Tiptap JSON — tsvector cannot index JSON usefully.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.tasks_search_vector_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A')
   || setweight(to_tsvector('english', coalesce(NEW.description_text, '')), 'B');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_search_vector_trigger ON "tasks";
CREATE TRIGGER tasks_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description_text ON "tasks"
  FOR EACH ROW EXECUTE FUNCTION public.tasks_search_vector_update();

-- GIN is the right index for tsvector containment queries.
CREATE INDEX "tasks_search_vector_idx" ON "tasks" USING GIN ("search_vector");

-- Trigram index on the title as well: full-text search misses substrings and
-- typos ("logi" will not match "login"), and quick-add / type-ahead needs
-- exactly that.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING GIN ("title" gin_trgm_ops);
