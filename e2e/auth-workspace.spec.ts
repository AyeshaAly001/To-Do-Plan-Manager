import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 1 acceptance: sign in, onboard into a workspace, and see the tenancy
 * layer working.
 *
 * Depends on a confirmed dev user existing:
 *   npm run dev:user -- owner@ash.test
 *
 * Written to be re-runnable: the first run onboards, later runs already have a
 * workspace, and the test handles both rather than requiring a database reset.
 */

const OWNER = { email: "owner@ash.test", password: "dev-password-12345" };

/**
 * Our own alerts, excluding Next's route announcer — which is also
 * `role="alert"` and would make every alert query ambiguous.
 */
const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** Our own status regions, for the same reason. */
const statuses = (page: Page) => page.locator('[role="status"]');

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Either destination is valid depending on whether onboarding is done.
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 30_000 });
}

/** Leaves the page on /home with a workspace guaranteed to exist. */
async function ensureWorkspace(page: Page) {
  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByLabel("Workspace name").fill("Ash Test Workspace");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await page.waitForURL("**/home", { timeout: 30_000 });
  }
}

test.describe("unauthenticated access", () => {
  test("protected routes redirect to login and preserve the destination", async ({ page }) => {
    const response = await page.goto("/team");
    expect(response?.url()).toContain("/login");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/team");
  });

  test("the login page offers password, magic link and OAuth", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "GitHub" })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign-in link instead/i })).toBeVisible();
  });

  test("does not reveal whether an account exists", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("definitely-not-a-user@ash.test");
    await page.getByLabel("Password").fill("whatever-12345");
    await page.getByRole("button", { name: "Sign in" }).click();

    // The message must be the same for "no such user" and "wrong password",
    // or it becomes an account-enumeration oracle.
    await expect(alerts(page)).toContainText("Incorrect email or password");
  });

  test("an unknown invitation token explains itself rather than 500ing", async ({ page }) => {
    await page.goto("/invite/not-a-real-token-aaaaaaaaaaaaaaaaaaaaaa");
    await expect(page.getByRole("heading", { name: "Invitation unavailable" })).toBeVisible();
    await expect(alerts(page)).toContainText("not valid");
  });
});

test.describe("signed in", () => {
  test("onboards into a workspace and shows it on home", async ({ page }) => {
    await signIn(page, OWNER.email, OWNER.password);
    await ensureWorkspace(page);

    await expect(page).toHaveURL(/\/home$/);
    // The workspace name is the page title, so this proves tenancy resolved.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(OWNER.email).first()).toBeVisible();
    await expect(page.getByText("Your role")).toBeVisible();
    await expect(page.getByText("owner", { exact: false }).first()).toBeVisible();
  });

  test("the sidebar shows the workspace switcher and it opens", async ({ page }) => {
    await signIn(page, OWNER.email, OWNER.password);
    await ensureWorkspace(page);

    const trigger = page.locator("aside").getByRole("button", { expanded: false }).first();
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Switch workspace" });
    await expect(menu).toBeVisible();

    // A menu that cannot be dismissed by keyboard is unusable without a mouse.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("an owner can reach the team page and invite someone", async ({ page }) => {
    await signIn(page, OWNER.email, OWNER.password);
    await ensureWorkspace(page);

    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Team", level: 1 })).toBeVisible();

    // The owner sees themselves, badged as Owner, with no remove control —
    // a workspace with no owner would be unrecoverable.
    await expect(page.getByText(OWNER.email).first()).toBeVisible();
    await expect(page.getByText("Owner").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`Remove .*${OWNER.email}`) }),
    ).toHaveCount(0);

    // Invite. Email is unconfigured in dev, so the action returns the link for
    // copying instead of silently claiming it sent one.
    //
    // A STABLE address on purpose: the action upserts on (workspace, email),
    // so re-running replaces the invitation rather than accumulating one per
    // run.
    const invitee = "invitee@ash.test";
    await page.getByLabel("Email").fill(invitee);
    // `exact` matters: Playwright matches accessible names by substring, and
    // "Invite" is contained in "Revoke invitation for ...".
    await page.getByRole("button", { name: "Invite", exact: true }).click();

    await expect(statuses(page)).toContainText(invitee, { timeout: 30_000 });
    await expect(page.getByText("Invitation link")).toBeVisible();
    await expect(page.getByText(/\/invite\//)).toBeVisible();
  });

  test("signing out returns to login and re-protects routes", async ({ page }) => {
    await signIn(page, OWNER.email, OWNER.password);
    await ensureWorkspace(page);

    await page.locator("aside").getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login", { timeout: 30_000 });

    // The session is genuinely gone, not just navigated away from.
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/);
  });
});
