import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The headline Phase 1 acceptance criterion: two separate users in one
 * workspace, with roles that actually mean something.
 *
 * Requires two confirmed dev users:
 *   npm run dev:user -- owner@ash.test
 *   npm run dev:user -- member@ash.test
 *
 * Uses two independent browser contexts rather than signing in and out of one,
 * because that is what "two people using the app at once" actually looks like
 * — and it catches session bleed that a sequential test would miss.
 */

const OWNER = { email: "owner@ash.test", password: "dev-password-12345" };
const MEMBER = { email: "member@ash.test", password: "dev-password-12345" };

const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/**
 * The member row containing a given email.
 *
 * Scope to the row rather than matching the remove button's accessible name
 * globally: that label is built from the DISPLAY NAME ("Remove member"), not
 * the email, so an email-based name matcher silently matches nothing — which
 * makes `toHaveCount(0)` assertions pass for the wrong reason.
 */
const memberRow = (page: Page, email: string) => page.locator("li").filter({ hasText: email });

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|onboarding|invite)/, { timeout: 30_000 });
}

/** A fresh, isolated browser session. */
async function newSession(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/**
 * Playwright's `browser` fixture may already have disposed contexts created
 * during the test, so closing them again throws "context has been closed".
 * Teardown must never be the thing that fails a passing test.
 */
async function closeQuietly(...contexts: { close: () => Promise<void> }[]) {
  await Promise.allSettled(contexts.map((c) => c.close()));
}

test.describe("two users, one workspace", () => {
  test("an invited member joins, sees the workspace, and cannot administer it", async ({
    browser,
  }) => {
    const owner = await newSession(browser);
    const member = await newSession(browser);

    try {
      // --- owner invites ---------------------------------------------------
      await signIn(owner.page, OWNER.email, OWNER.password);
      if (new URL(owner.page.url()).pathname === "/onboarding") {
        await owner.page.getByLabel("Workspace name").fill("Ash Test Workspace");
        await owner.page.getByRole("button", { name: "Create workspace" }).click();
        await owner.page.waitForURL("**/home", { timeout: 30_000 });
      }

      await owner.page.goto("/team");

      // Re-runnability: a previous run may have left this person in the
      // workspace, in which case inviting them again correctly reports
      // "already a member" and no link is produced. Remove them first, which
      // also exercises the removal path.
      const memberRowBefore = memberRow(owner.page, MEMBER.email);
      if (await memberRowBefore.count()) {
        await memberRowBefore.getByRole("button", { name: /^Remove / }).click();
        await memberRowBefore.getByRole("button", { name: "Confirm" }).click();
        await expect(memberRow(owner.page, MEMBER.email)).toHaveCount(0, {
          timeout: 30_000,
        });
      }

      await owner.page.getByLabel("Email").fill(MEMBER.email);
      await owner.page.getByRole("button", { name: "Invite", exact: true }).click();

      // Email is unconfigured in dev, so the link is surfaced for copying.
      const linkText = owner.page.getByText(/http.*\/invite\//);
      await expect(linkText).toBeVisible({ timeout: 30_000 });
      const inviteUrl = (await linkText.textContent())!.trim();
      expect(inviteUrl).toContain("/invite/");

      // --- member accepts --------------------------------------------------
      await signIn(member.page, MEMBER.email, MEMBER.password);
      await member.page.goto(new URL(inviteUrl).pathname);

      await expect(
        member.page.getByRole("heading", { name: /Join Ash Test Workspace/ }),
      ).toBeVisible();
      await member.page.getByRole("button", { name: /Join Ash Test Workspace/ }).click();
      await member.page.waitForURL("**/home", { timeout: 30_000 });

      // They are in the workspace, as a member.
      await expect(member.page.getByText("Ash Test Workspace").first()).toBeVisible();
      await expect(member.page.getByText("member", { exact: false }).first()).toBeVisible();

      // --- the role is enforced, not decorative ----------------------------
      // A MEMBER lacks `member.invite`, so the invite form must be absent.
      await member.page.goto("/team");
      await expect(
        member.page.getByRole("button", { name: "Invite", exact: true }),
      ).toHaveCount(0);
      await expect(member.page.getByText("Pending invitations")).toHaveCount(0);

      // They can still see who is in the workspace (`member.view`).
      await expect(member.page.getByText(OWNER.email).first()).toBeVisible();

      // And they cannot remove the owner. Asserted INSIDE the owner's row, so
      // the assertion fails if the row is missing rather than passing vacuously.
      const ownerRow = memberRow(member.page, OWNER.email);
      await expect(ownerRow).not.toHaveCount(0);
      await expect(ownerRow.getByRole("button", { name: /^Remove / })).toHaveCount(0);

      // --- the owner sees the new member ----------------------------------
      await owner.page.reload();
      await expect(owner.page.getByText(MEMBER.email).first()).toBeVisible();

      // --- the invitation is single-use ------------------------------------
      await member.page.goto(new URL(inviteUrl).pathname);
      await expect(
        member.page.getByRole("heading", { name: "Invitation unavailable" }),
      ).toBeVisible();
      await expect(alerts(member.page)).toContainText("already been used");
    } finally {
      await closeQuietly(owner.context, member.context);
    }
  });

  test("sessions do not bleed between contexts", async ({ browser }) => {
    const a = await newSession(browser);
    const b = await newSession(browser);

    try {
      await signIn(a.page, OWNER.email, OWNER.password);

      // The second context never signed in, so it must still be anonymous
      // even though the first one holds a live session in the same browser.
      const response = await b.page.goto("/home");
      expect(response?.url()).toContain("/login");
    } finally {
      await closeQuietly(a.context, b.context);
    }
  });
});
