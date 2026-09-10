import { NextResponse } from "next/server";

/**
 * Keeps the Supabase free-tier project from pausing.
 *
 * Free projects pause after 7 consecutive days without DATABASE activity and
 * then need a manual restore from the dashboard. Dashboard visits and cached
 * API responses do not count — it has to be a real query. So this endpoint
 * issues the cheapest possible one on a daily Vercel Cron (see vercel.json).
 *
 * Guarded by CRON_SECRET: Vercel sends it as a bearer token, and without the
 * check this would be an unauthenticated database-touching endpoint.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  // Fail closed. A missing secret in production means the guard is not doing
  // its job, which is worse than the cron not running.
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Phase 1 swaps this for `prisma.$queryRaw\`SELECT 1\`` once the client is
    // generated against a real database. Until the project is provisioned there
    // is nothing to ping, and reporting "skipped" is more honest than pretending.
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ status: "skipped", reason: "DATABASE_URL not set" });
    }

    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({ status: "ok", pingedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[cron/keepalive] database ping failed", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
