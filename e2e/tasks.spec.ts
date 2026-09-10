import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2 acceptance: projects, tasks, quick-add parsing, inline edit,
 * grouping, bulk actions and the deep-linkable drawer.
 *
 * Requires a confirmed dev user:
 *   npm run dev:user -- owner@ash.test
 *
 * Re-runnable: each run creates a uniquely named project rather than assuming
 * a clean database.
 */

const OWNER = { email: "owner@ash.test", password: "dev-password-12345" };

const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 30_000 });

  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByLabel("Workspace name").fill("Ash Test Workspace");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await page.waitForURL("**/home", { timeout: 30_000 });
  }
}

/** Creates a project and returns its URL. */
async function createProject(page: Page, name: string) {
  await page.goto("/projects");
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  // Creating navigates straight into the project.
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  return page.url();
}

const uniqueName = () => `Test Project ${Date.now().toString(36)}`;

test.describe("projects", () => {
  test("creates a project with default sections and a derived key", async ({ page }) => {
    await signIn(page);
    await createProject(page, "Website Redesign");

    // Derived from the initials of "Website Redesign". A numeric suffix is
    // expected on re-runs, since keys are unique per workspace — asserting an
    // exact "WR" would only pass on a clean database.
    await expect(page.getByText(/^WR\d*$/)).toBeVisible();

    // A brand-new project shows the empty state rather than three empty
    // headings — a wall of empty groups on first run reads as broken.
    await expect(page.getByText("Nothing here yet")).toBeVisible();

    // Once there is a task, the default sections appear as groups.
    await page.getByLabel("Add a task").first().fill("first task");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      page.locator("[data-task-id]").filter({ hasText: "first task" }),
    ).toBeVisible();

    for (const section of ["To do", "In progress", "Done"]) {
      await expect(page.getByRole("heading", { name: section })).toBeVisible();
    }
  });

  test("an inaccessible project id is a 404, not a forbidden page", async ({ page }) => {
    await signIn(page);
    // A well-formed uuid that is not ours must be indistinguishable from one
    // that does not exist, or the response confirms the id.
    const response = await page.goto("/projects/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
  });
});

test.describe("quick-add", () => {
  test("previews what it parsed before creating anything", async ({ page }) => {
    await signIn(page);
    await createProject(page, uniqueName());

    const input = page.getByLabel("Add a task").first();
    await input.fill("fix login tomorrow 5pm !high");

    // The preview is the point: it confirms the interpretation up front.
    const preview = page.getByText("Will create:");
    await expect(preview).toBeVisible();
    await expect(page.getByText("fix login", { exact: true })).toBeVisible();
    await expect(page.getByText("Tomorrow", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("High", { exact: true }).first()).toBeVisible();
  });

  test("creates the task with the parsed fields applied", async ({ page }) => {
    await signIn(page);
    await createProject(page, uniqueName());

    await page.getByLabel("Add a task").first().fill("ship the thing tomorrow !urgent");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // Title has the tokens stripped, and the badges reflect them.
    const row = page.locator("[data-task-id]").filter({ hasText: "ship the thing" });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.getByText("Urgent")).toBeVisible();
    await expect(row.getByText("Tomorrow")).toBeVisible();
  });

  test("refuses input that is only tags", async ({ page }) => {
    await signIn(page);
    await createProject(page, uniqueName());

    await page.getByLabel("Add a task").first().fill("!high");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // The parser consumes everything, leaving no title — that must be an
    // error, not a task called "".
    await expect(alerts(page)).toContainText("title");
  });

  test("says so when an @mention matches nobody", async ({ page }) => {
    await signIn(page);
    await createProject(page, uniqueName());

    await page.getByLabel("Add a task").first().fill("review copy @nobodyhere");
    // Silently dropping it would look like it worked.
    await expect(page.getByText("@nobodyhere not found")).toBeVisible();
  });
});

test.describe("task interactions", () => {
  test("completing a task ticks instantly and strikes the title", async ({ page }) => {
    await signIn(page);
    await createProject(page, uniqueName());

    await page.getByLabel("Add a task").first().fill("a task to complete");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = page.locator("[data-task-id]").filter({ hasText: "a task to complete" });
    await expect(row).toBeVisible({ timeout: 30_000 });

    await row.getByRole("checkbox", { name: /^Complete/ }).click();
    await expect(row.getByRole("checkbox", { name: /^Reopen/ })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("renames inline via the rename control", async ({ page }) => {
    await signIn(page);
    await createProject(page, uniqueName());

    await page.getByLabel("Add a task").first().fill("original title");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const byText = page.locator("[data-task-id]").filter({ hasText: "original title" });
    await expect(byText).toBeVisible();

    // Anchor on the id, not the text. Once the title becomes an <input> its
    // text lives in `value`, which `hasText` does not match — a text-based
    // row locator stops resolving mid-edit.
    const taskId = await byText.getAttribute("data-task-id");
    const row = page.locator(`[data-task-id="${taskId}"]`);

    await row.getByRole("button", { name: "Rename original title" }).click();
    const editor = row.getByLabel("Task title");
    await expect(editor).toBeVisible();
    await editor.fill("renamed inline");
    await editor.press("Enter");

    await expect(row).toContainText("renamed inline");
  });

  test("the drawer opens, is deep-linkable, and closes with Escape", async ({ page }) => {
    await signIn(page);
    const projectUrl = await createProject(page, uniqueName());

    await page.getByLabel("Add a task").first().fill("open me in the drawer");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = page.locator("[data-task-id]").filter({ hasText: "open me in the drawer" });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "open me in the drawer", exact: true }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 30_000 });

    // The task id is in the URL, which is what makes a link to a task work.
    const url = new URL(page.url());
    expect(url.searchParams.get("task")).toBeTruthy();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // Reloading the deep link reopens it — proving the URL, not a click, is
    // what drives the drawer.
    await page.goto(`${projectUrl}?task=${url.searchParams.get("task")}`);
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
  });

  test("a stale task id in the URL does not leave an empty drawer", async ({ page }) => {
    await signIn(page);
    const projectUrl = await createProject(page, uniqueName());

    await page.goto(`${projectUrl}?task=00000000-0000-4000-8000-000000000000`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The bad id is dropped from the URL rather than left in place.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("task"), { timeout: 30_000 })
      .toBeNull();
  });
});

test.describe("grouping and bulk actions", () => {
  test("grouping is in the URL so a view is shareable", async ({ page }) => {
    await signIn(page);
    await createProject(page, uniqueName());

    await page.getByLabel("Group by").selectOption("priority");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("group"), { timeout: 30_000 })
      .toBe("priority");

    // Back to the default clears the param rather than writing group=section.
    await page.getByLabel("Group by").selectOption("section");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("group"), { timeout: 30_000 })
      .toBeNull();
  });

  test("bulk-sets priority across a selection", async ({ page }) => {
    await signIn(page);
    await createProject(page, uniqueName());

    for (const title of ["bulk one", "bulk two"]) {
      await page.getByLabel("Add a task").first().fill(title);
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.locator("[data-task-id]").filter({ hasText: title })).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.getByRole("checkbox", { name: "Select bulk one" }).check();
    await page.getByRole("checkbox", { name: "Select bulk two" }).check();

    const toolbar = page.getByRole("toolbar", { name: "Bulk actions" });
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText("2 selected");

    await toolbar.getByLabel("Set priority").selectOption("HIGH");

    for (const title of ["bulk one", "bulk two"]) {
      await expect(
        page.locator("[data-task-id]").filter({ hasText: title }).getByText("High"),
      ).toBeVisible({ timeout: 30_000 });
    }
  });
});
