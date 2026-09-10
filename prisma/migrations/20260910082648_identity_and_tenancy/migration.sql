/*
  Warnings:

  - You are about to drop the column `checkedAt` on the `system_health` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "workspace_role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'GUEST');

-- AlterTable
ALTER TABLE "system_health" DROP COLUMN "checkedAt",
ADD COLUMN     "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "weekly_capacity_hours" INTEGER NOT NULL DEFAULT 40,
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "owner_id" UUID NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role" "workspace_role" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "workspace_role" NOT NULL DEFAULT 'MEMBER',
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diff" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_owner_id_idx" ON "workspaces"("owner_id");

-- CreateIndex
CREATE INDEX "workspace_members_profile_id_idx" ON "workspace_members"("profile_id");

-- CreateIndex
CREATE INDEX "workspace_members_workspace_id_role_idx" ON "workspace_members"("workspace_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_profile_id_key" ON "workspace_members"("workspace_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_workspace_id_email_key" ON "invitations"("workspace_id", "email");

-- CreateIndex
CREATE INDEX "activity_log_workspace_id_created_at_idx" ON "activity_log"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_log_entity_type_entity_id_idx" ON "activity_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"("recipient_id", "read_at");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Row Level Security: deny-all
-- ---------------------------------------------------------------------------
-- Enabling RLS with NO policies denies all access to the `anon` and
-- `authenticated` roles. That is deliberate and is the whole design:
--
--   * Prisma connects as the table OWNER, which bypasses RLS, so the
--     application is unaffected.
--   * Authorization is enforced in lib/auth/action.ts, NOT here.
--   * This exists purely as leak insurance: if the publishable key ever
--     escapes, it can still read nothing.
--
-- Revoking the grants as well removes these tables from the auto-generated
-- PostgREST surface entirely, so they are not merely unreadable but absent.
-- ===========================================================================

ALTER TABLE "profiles"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_log"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "system_health"     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "profiles"          FROM anon, authenticated;
REVOKE ALL ON "workspaces"        FROM anon, authenticated;
REVOKE ALL ON "workspace_members" FROM anon, authenticated;
REVOKE ALL ON "invitations"       FROM anon, authenticated;
REVOKE ALL ON "activity_log"      FROM anon, authenticated;
REVOKE ALL ON "notifications"     FROM anon, authenticated;
REVOKE ALL ON "system_health"     FROM anon, authenticated;

-- ===========================================================================
-- Keep public.profiles in step with auth.users
-- ---------------------------------------------------------------------------
-- Supabase owns auth.users; Prisma does not manage the auth schema. Rather
-- than a cross-schema foreign key (which Prisma's differ would try to drop on
-- the next migration), the link is maintained by triggers. Triggers and
-- functions are invisible to Prisma's diff, so they survive future migrations.
--
-- Doing this in the database rather than in application code means a Profile
-- always exists by the time any request runs — no code path has to handle a
-- half-created user, including OAuth callbacks and admin-created users.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    -- Google sends full_name; GitHub sends name. Fall back to the local part
    -- of the address so the UI never has to render an empty display name.
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    -- profiles.updated_at is NOT NULL with no database default, because
    -- Prisma's @updatedAt is applied application-side. This insert bypasses
    -- Prisma, so it must supply the value itself.
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;



-- Mirror email changes made through Supabase Auth.
CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
       SET email = NEW.email, updated_at = now()
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;



-- Deleting the auth user removes the profile. Cascades from there take care
-- of memberships, notifications and so on.
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- Attach the triggers, but only where auth.users actually exists.
--
-- Prisma builds a SHADOW DATABASE to diff the schema, and that database is a
-- plain Postgres instance with no Supabase `auth` schema. Creating a trigger
-- ON auth.users there fails with "schema auth does not exist" and breaks every
-- future `prisma migrate dev`. The functions above are created unconditionally
-- (plpgsql bodies are not resolved until they run); only the trigger
-- attachment needs guarding.
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

    DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
    CREATE TRIGGER on_auth_user_updated
      AFTER UPDATE ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_updated();

    DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
    CREATE TRIGGER on_auth_user_deleted
      AFTER DELETE ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();
  ELSE
    RAISE NOTICE 'auth.users not present (shadow database) - skipping auth triggers';
  END IF;
END
$guard$;
