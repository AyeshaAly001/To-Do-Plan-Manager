import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 4 acceptance: comments, mentions, reactions, attachments,
 * notifications and the activity feed.
 *
 * Requires two confirmed dev users:
 *   npm run dev:user -- owner@ash.test
 *   npm run dev:user -- member@ash.test
 */

const OWNER = { email: "owner@ash.test", password: "dev-password-12345" };
const MEMBER = { email: "member@ash.test", password: "dev-password-12345" };

const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 60_000 });

  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByLabel("Workspace name").fill("Ash Test Workspace");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await page.waitForURL("**/home", { timeout: 60_000 });
  }
}

/** A project with one task, with the task's drawer already open. */
async function taskWithDrawer(page: Page, titleBase = "collab task") {
  // Unique per call: an identically titled row left by an earlier run makes
  // the row locator ambiguous.
  const title = `${titleBase} ${Date.now().toString(36)}`;
  await page.goto("/projects");
  await page.getByLabel("Project name").fill(`Test Project ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 60_000 });

  await page.getByLabel("Add a task").first().fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const row = page.locator("[data-task-id]").filter({ hasText: title });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole("button", { name: title, exact: true }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  return drawer;
}

/** Tiptap needs the contenteditable focused before typing. */
async function typeComment(page: Page, drawer: ReturnType<Page["getByRole"]>, text: string) {
  const editor = drawer.getByRole("textbox", { name: "Comment" }).last();
  await editor.click();
  await page.keyboard.type(text);
}

test.describe("comments", () => {
  test("posts a comment and shows it in the thread", async ({ page }) => {
    await signIn(page, OWNER);
    const drawer = await taskWithDrawer(page);

    await expect(drawer.getByRole("tab", { name: "Comments" })).toBeVisible();
    await expect(drawer.getByText("No comments yet")).toBeVisible();

    await typeComment(page, drawer, "first thoughts on this");
    await drawer.getByRole("button", { name: "Comment", exact: true }).click();

    await expect(drawer.getByText("first thoughts on this")).toBeVisible({ timeout: 60_000 });
    await expect(drawer.getByText("No comments yet")).toHaveCount(0);
  });

  test("edits a comment and marks it edited", async ({ page }) => {
    await signIn(page, OWNER);
    const drawer = await taskWithDrawer(page);

    await typeComment(page, drawer, "original wording");
    await drawer.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(drawer.getByText("original wording")).toBeVisible({ timeout: 60_000 });

    await drawer.getByRole("button", { name: "Edit comment" }).click();
    const editor = drawer.getByRole("textbox", { name: "Comment" }).first();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("revised wording");
    await drawer.getByRole("button", { name: "Save" }).click();

    await expect(drawer.getByText("revised wording")).toBeVisible({ timeout: 60_000 });
    // Readers deserve to know the text changed rather than being rewritten
    // silently.
    await expect(drawer.getByText("(edited)")).toBeVisible();
  });

  test("deleting leaves a placeholder so replies keep their context", async ({ page }) => {
    await signIn(page, OWNER);
    const drawer = await taskWithDrawer(page);

    await typeComment(page, drawer, "to be deleted");
    await drawer.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(drawer.getByText("to be deleted")).toBeVisible({ timeout: 60_000 });

    await drawer.getByRole("button", { name: "Delete comment" }).click();
    await expect(drawer.getByText("This comment was deleted")).toBeVisible({
      timeout: 60_000,
    });
    await expect(drawer.getByText("to be deleted")).toHaveCount(0);
  });

  test("reactions group by emoji and toggle off", async ({ page }) => {
    await signIn(page, OWNER);
    const drawer = await taskWithDrawer(page);

    await typeComment(page, drawer, "react to this");
    await drawer.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(drawer.getByText("react to this")).toBeVisible({ timeout: 60_000 });

    await drawer.getByRole("button", { name: "Add a reaction" }).click();
    await drawer.getByRole("button", { name: "React with 👍" }).click();

    const chip = drawer.getByRole("button", { name: /👍 1/ });
    await expect(chip).toBeVisible({ timeout: 60_000 });
    await expect(chip).toHaveAttribute("aria-pressed", "true");

    // Clicking again removes it rather than stacking a second reaction.
    await chip.click();
    await expect(drawer.getByRole("button", { name: /👍/ })).toHaveCount(0, {
      timeout: 60_000,
    });
  });

  test("the mention autocomplete offers workspace members", async ({ page }) => {
    await signIn(page, OWNER);
    const drawer = await taskWithDrawer(page);

    await typeComment(page, drawer, "asking @");

    const listbox = page.getByRole("listbox", { name: "Mention someone" });
    await expect(listbox).toBeVisible({ timeout: 30_000 });
    await expect(listbox.getByRole("option").first()).toBeVisible();
  });
});

test.describe("attachments", () => {
  test("shows the upload affordance and an empty state", async ({ page }) => {
    await signIn(page, OWNER);
    const drawer = await taskWithDrawer(page);

    await drawer.getByRole("tab", { name: "Files" }).click();
    await expect(drawer.getByText("No files attached.")).toBeVisible();
    await expect(drawer.getByRole("button", { name: /Choose a file/ })).toBeVisible();
    await expect(drawer.getByText(/up to 10 MB/)).toBeVisible();
  });

  test("refuses a disallowed type before uploading anything", async ({ page }) => {
    await signIn(page, OWNER);
    const drawer = await taskWithDrawer(page);
    await drawer.getByRole("tab", { name: "Files" }).click();

    // SVG is excluded deliberately: served from our own origin it can execute
    // JavaScript, which would be stored XSS against colleagues.
    await page.locator('input[type="file"]').setInputFiles({
      name: "evil.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    });

    await expect(alerts(page)).toContainText("not allowed", { timeout: 30_000 });
    await expect(drawer.getByText("No files attached.")).toBeVisible();
  });

  test("uploads an allowed file and lists it", async ({ page }) => {
    await signIn(page, OWNER);
    const drawer = await taskWithDrawer(page);
    await drawer.getByRole("tab", { name: "Files" }).click();

    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("a short attachment used by the test suite"),
    });

    await expect(drawer.getByText("notes.txt")).toBeVisible({ timeout: 90_000 });
    await expect(drawer.getByRole("button", { name: /Download notes.txt/ })).toBeVisible();
  });
});

test.describe("notifications", () => {
  test("a mention notifies the other person, not the author", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const memberCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const member = await memberCtx.newPage();

    try {
      // The member must be in the workspace to be mentionable.
      await signIn(owner, OWNER);
      await owner.goto("/team");
      const memberRow = owner.locator("li").filter({ hasText: MEMBER.email });
      if ((await memberRow.count()) === 0) {
        await owner.getByLabel("Email").fill(MEMBER.email);
        await owner.getByRole("button", { name: "Invite", exact: true }).click();
        const link = owner.getByText(/http.*\/invite\//);
        await expect(link).toBeVisible({ timeout: 60_000 });
        const inviteUrl = (await link.textContent())!.trim();

        await signIn(member, MEMBER);
        await member.goto(new URL(inviteUrl).pathname);
        await member.getByRole("button", { name: /^Join / }).click();
        await member.waitForURL("**/home", { timeout: 60_000 });
      } else {
        await signIn(member, MEMBER);
      }

      // Owner mentions the member.
      const drawer = await taskWithDrawer(owner, "mention target task");
      const editor = drawer.getByRole("textbox", { name: "Comment" }).last();
      await editor.click();
      await owner.keyboard.type("please look at this @");

      const listbox = owner.getByRole("listbox", { name: "Mention someone" });
      await expect(listbox).toBeVisible({ timeout: 30_000 });
      await owner.keyboard.type("member");
      await expect(listbox.getByRole("option").first()).toBeVisible();
      await owner.keyboard.press("Enter");
      await drawer.getByRole("button", { name: "Comment", exact: true }).click();
      await expect(drawer.getByText(/please look at this/)).toBeVisible({ timeout: 60_000 });

      // The author must NOT be notified about their own comment.
      await owner.goto("/inbox");
      await expect(
        owner.getByRole("button", { name: /Notifications, \d+ unread/ }),
      ).toHaveCount(0);

      // The mentioned member is.
      await member.goto("/inbox");
      await expect(member.getByText(/mentioned you on/).first()).toBeVisible({
        timeout: 60_000,
      });
    } finally {
      await Promise.allSettled([ownerCtx.close(), memberCtx.close()]);
    }
  });

  test("marking all read clears the badge", async ({ page }) => {
    await signIn(page, MEMBER);
    await page.goto("/inbox");

    const markAll = page.getByRole("button", { name: "Mark all read" }).first();
    if (await markAll.count()) {
      await markAll.click();
      await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(0, {
        timeout: 60_000,
      });
    }
    await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
  });
});

test.describe("activity feed", () => {
  test("records what happened, in readable language", async ({ page }) => {
    await signIn(page, OWNER);
    await taskWithDrawer(page, "activity task");

    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Workspace activity" })).toBeVisible();

    // Written by the authedAction wrapper, so the feed cannot drift from what
    // actually happened.
    await expect(page.getByText(/created this project/).first()).toBeVisible({
      timeout: 60_000,
    });
  });
});
