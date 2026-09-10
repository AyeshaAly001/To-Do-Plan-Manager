/**
 * Creates a pre-confirmed development user.
 *
 *   npm run dev:user -- alice@example.test
 *
 * Why this exists: the project requires email confirmation
 * (`mailer_autoconfirm: false`), and Supabase's built-in mailer is heavily
 * rate-limited on the free tier. Waiting on real email makes the multi-user
 * flows (invitations, role changes) impractical to test. The admin API can
 * create an already-confirmed user, which is exactly what a dev fixture needs.
 *
 * Uses SUPABASE_SECRET_KEY, so it is a local/dev tool only — never import this
 * from application code.
 *
 * It also verifies that the `on_auth_user_created` trigger populated
 * `public.profiles`, which is the one bit of behaviour that lives in raw SQL
 * and would otherwise go unchecked.
 */

import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client.ts";

config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const connectionString = process.env.DATABASE_URL;

if (!url || !secret || !connectionString) {
  console.error("  Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and DATABASE_URL.");
  process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3] ?? "dev-password-12345";

if (!email) {
  console.error("  Usage: npm run dev:user -- someone@example.test [password]");
  process.exit(1);
}

const adminHeaders = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};

// Create, already confirmed. `full_name` lands in raw_user_meta_data, which is
// where the trigger reads it from.
const createRes = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers: adminHeaders,
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: email.split("@")[0] },
  }),
});

const created = (await createRes.json()) as { id?: string; msg?: string; message?: string };

let userId = created.id;

if (!createRes.ok) {
  const message = created.msg ?? created.message ?? "unknown error";
  // Idempotent: re-running with the same address should not be an error.
  if (/already/i.test(message)) {
    const listRes = await fetch(
      `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
      { headers: adminHeaders },
    );
    const list = (await listRes.json()) as { users?: { id: string; email: string }[] };
    userId = list.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    console.log(`  user already existed: ${email}`);
  } else {
    console.error(`  admin API ${createRes.status}: ${message}`);
    process.exit(1);
  }
} else {
  console.log(`  created confirmed user: ${email}`);
}

if (!userId) {
  console.error("  could not determine the user id");
  process.exit(1);
}

// The real point of this script: prove the SQL trigger fired.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, timezone: true, createdAt: true },
  });

  if (!profile) {
    console.error(
      "\n  FAIL  no row in public.profiles for this auth user.\n" +
        "        The on_auth_user_created trigger did not fire.\n",
    );
    process.exit(1);
  }

  console.log("\n  Profile trigger verified:");
  console.log(`    id        ${profile.id}`);
  console.log(`    email     ${profile.email}`);
  console.log(`    fullName  ${profile.fullName}`);
  console.log(`    timezone  ${profile.timezone}`);
  console.log(`\n  Sign in with:  ${email} / ${password}\n`);
} finally {
  await prisma.$disconnect();
}
