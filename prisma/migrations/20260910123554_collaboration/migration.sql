-- DropIndex
DROP INDEX "tasks_search_vector_idx";

-- DropIndex
DROP INDEX "tasks_title_trgm_idx";

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" JSONB,
    "body_text" TEXT NOT NULL,
    "parent_comment_id" UUID,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentions" (
    "id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "mentioned_profile_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_task_id_created_at_idx" ON "comments"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_author_id_idx" ON "comments"("author_id");

-- CreateIndex
CREATE INDEX "mentions_mentioned_profile_id_idx" ON "mentions"("mentioned_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "mentions_comment_id_mentioned_profile_id_key" ON "mentions"("comment_id", "mentioned_profile_id");

-- CreateIndex
CREATE INDEX "reactions_comment_id_idx" ON "reactions"("comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_comment_id_profile_id_emoji_key" ON "reactions"("comment_id", "profile_id", "emoji");

-- CreateIndex
CREATE INDEX "attachments_task_id_idx" ON "attachments"("task_id");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_profile_id_fkey" FOREIGN KEY ("mentioned_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Row Level Security: deny-all on the new tables
-- ---------------------------------------------------------------------------
-- Same reasoning as every previous phase. `npm run verify:security` fails if
-- any public table is missed.
-- ===========================================================================

ALTER TABLE "comments"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mentions"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reactions"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "comments"    FROM anon, authenticated;
REVOKE ALL ON "mentions"    FROM anon, authenticated;
REVOKE ALL ON "reactions"   FROM anon, authenticated;
REVOKE ALL ON "attachments" FROM anon, authenticated;

-- ===========================================================================
-- Realtime
-- ---------------------------------------------------------------------------
-- Supabase Realtime streams changes from a publication. Only the tables the
-- app actually subscribes to are added — every extra table is WAL traffic and
-- bandwidth on a free-tier project.
--
-- Note what is NOT here: `comments.body_text` and task titles go over the wire
-- to every subscriber on the channel, and Realtime respects RLS for the
-- publishable key. Because RLS is deny-all, the browser client receives
-- nothing directly; the app subscribes only to change NOTIFICATIONS and then
-- refetches through the authorized server path. That keeps tenancy enforcement
-- in one place rather than duplicating it in RLS policies.
-- ===========================================================================

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "tasks";
    ALTER PUBLICATION supabase_realtime ADD TABLE "comments";
  ELSE
    -- Not a Supabase database (a shadow database, for instance).
    RAISE NOTICE 'supabase_realtime publication not present - skipping';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'tables already in supabase_realtime - skipping';
END
$realtime$;
