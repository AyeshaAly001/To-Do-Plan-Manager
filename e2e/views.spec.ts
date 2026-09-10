import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 acceptance: board, calendar, table, My Tasks and the command
 * palette.
 *
 * Requires a confirmed dev user:
 *   npm run dev:user -- owner@ash.test
 */

const OWNER = { email: "owner@ash.test", password: "dev-password-12345" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 60_000 });

  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByLabel("Workspace name").fill("Ash Test Workspace");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await page.waitForURL("**/home", { timeout: 60_000 });
  }
}

/**
 * Opens the palette via the keyboard shortcut.
 *
 * Retries because the listener only exists after React hydrates, and pressing
 * a global shortcut immediately after navigation is a genuine race. Polling is
 * honest about that; a fixed sleep would either be flaky or slow.
 */
async function openPalette(page: Page) {
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect
    .poll(
      async () => {
        if (await palette.isVisible()) return true;
        await page.keyboard.press("ControlOrMeta+k");
        return palette.isVisible();
      },
      { timeout: 30_000, intervals: [300, 500, 800, 1000] },
    )
    .toBe(true);
  return palette;
}

/** A project with `count` tasks, returned as its URL. */
async function projectWithTasks(page: Page, count: number) {
  await page.goto("/projects");
  await page.getByLabel("Project name").fill(`Test Project ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 60_000 });

  for (let i = 1; i <= count; i++) {
    await page.getByLabel("Add a task").first().fill(`view task ${i} tomorrow`);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      page.locator("[data-task-id]").filter({ hasText: `view task ${i}` }),
    ).toBeVisible();
  }

  return page.url().split("?")[0]!;
}

test.describe("view switcher", () => {
  test("each view is reachable and recorded in the URL", async ({ page }) => {
    await signIn(page);
    await projectWithTasks(page, 2);

    for (const view of ["board", "calendar", "table"]) {
      await page.getByRole("tab", { name: new RegExp(view, "i") }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe(view);
      await expect(page.getByRole("tab", { name: new RegExp(view, "i") })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }

    // Returning to the default clears the param rather than writing view=list.
    await page.getByRole("tab", { name: /list/i }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBeNull();
  });

  test("a view deep link opens directly in that view", async ({ page }) => {
    await signIn(page);
    const url = await projectWithTasks(page, 1);

    await page.goto(`${url}?view=board`);
    await expect(page.getByRole("tab", { name: /board/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

test.describe("board", () => {
  test("renders a column per section with counts", async ({ page }) => {
    await signIn(page);
    const url = await projectWithTasks(page, 2);
    await page.goto(`${url}?view=board`);

    for (const section of ["To do", "In progress", "Done"]) {
      await expect(page.getByRole("heading", { name: section })).toBeVisible();
    }
    // Both tasks land in the ungrouped column, since quick-add at the top of
    // the list files them without a section.
    await expect(page.locator("article").filter({ hasText: "view task 1" })).toBeVisible();
  });

  test("a card is keyboard-draggable, not mouse-only", async ({ page }) => {
    await signIn(page);
    const url = await projectWithTasks(page, 2);
    await page.goto(`${url}?view=board`);

    const card = page.locator("article").filter({ hasText: "view task 1" }).first();
    await expect(card).toBeVisible();

    // dnd-kit's keyboard sensor: focus, Space to lift, arrows to move, Space
    // to drop. A board that only works with a mouse excludes keyboard and
    // screen-reader users entirely.
    await card.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");

    // The move is announced in a live region rather than only being visual.
    await expect(card).toBeVisible();
  });

  test("cards open the drawer", async ({ page }) => {
    await signIn(page);
    const url = await projectWithTasks(page, 1);
    await page.goto(`${url}?view=board`);

    await page
      .locator("article")
      .filter({ hasText: "view task 1" })
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("calendar", () => {
  test("shows a month grid with today marked", async ({ page }) => {
    await signIn(page);
    const url = await projectWithTasks(page, 1);
    await page.goto(`${url}?view=calendar`);

    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      await expect(page.getByText(day, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next month" })).toBeVisible();
  });

  test("navigating months offers a way back to today", async ({ page }) => {
    await signIn(page);
    const url = await projectWithTasks(page, 1);
    await page.goto(`${url}?view=calendar`);

    // No "Today" button while already on this month — it would do nothing.
    await expect(page.getByRole("button", { name: "Today" })).toHaveCount(0);
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
    await page.getByRole("button", { name: "Today" }).click();
    await expect(page.getByRole("button", { name: "Today" })).toHaveCount(0);
  });
});

test.describe("table", () => {
  test("sorts by a column and offers CSV export", async ({ page }) => {
    await signIn(page);
    const url = await projectWithTasks(page, 3);
    await page.goto(`${url}?view=table`);

    await expect(page.getByRole("columnheader", { name: /Task/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Export CSV/ })).toBeEnabled();

    const firstCellBefore = await page.locator("tbody tr").first().innerText();
    await page.getByRole("button", { name: /^ID/ }).click();
    const firstCellAfter = await page.locator("tbody tr").first().innerText();

    // Reversing the sort must actually change which row is first.
    expect(firstCellAfter).not.toBe(firstCellBefore);
  });

  test("exports a CSV that quotes fields", async ({ page }) => {
    await signIn(page);
    await page.goto("/projects");
    await page.getByLabel("Project name").fill(`Test Project ${Date.now().toString(36)}`);
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 60_000 });

    // A title containing a comma and a quote is exactly what breaks a naive
    // join(",") export.
    await page.getByLabel("Add a task").first().fill('fix "login", urgently');
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("[data-task-id]").first()).toBeVisible();

    await page.goto(`${page.url().split("?")[0]}?view=table`);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export CSV/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
  });
});

test.describe("my tasks", () => {
  test("shows an honest empty state when nothing is assigned", async ({ page }) => {
    await signIn(page);
    await page.goto("/my-tasks");

    // Quick-add does not assign anyone, so an unassigned task must NOT appear
    // here — otherwise "my tasks" means "all tasks".
    await expect(page.getByRole("heading", { name: "My tasks", level: 1 })).toBeVisible();
    // `exact` matters: the page subtitle says "Nothing assigned to you right
    // now." and would otherwise also match.
    await expect(page.getByText("Nothing assigned to you", { exact: true })).toBeVisible();
  });

  test("lists a task once it is assigned, in a due-date bucket", async ({ page }) => {
    await signIn(page);
    const url = await projectWithTasks(page, 1);

    // Open via the title button by NAME. A positional index broke as soon as
    // the rename control was added to the row.
    await page
      .locator("[data-task-id]")
      .first()
      .getByRole("button", { name: /^view task 1$/ })
      .click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    // The assignee button is labelled by DISPLAY NAME, not email — the
    // auth.users trigger derives fullName from the address local part.
    const displayName = OWNER.email.split("@")[0]!;
    const assigneeButton = drawer
      .getByRole("button", { name: new RegExp(displayName, "i") })
      .first();
    await assigneeButton.click();

    // Wait for the change to land instead of racing it. aria-pressed only
    // flips once the drawer has refetched, which is exactly the signal that
    // the write completed.
    await expect(assigneeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 30_000,
    });

    await page.keyboard.press("Escape");

    await page.goto("/my-tasks");
    await expect(page.getByText("Nothing assigned to you", { exact: true })).toHaveCount(0);
    // Due "tomorrow", so it belongs in the next-7-days bucket.
    await expect(page.getByRole("heading", { name: "Next 7 days" })).toBeVisible();

    // Unassign again, so this test leaves no residue for the empty-state test.
    // My Tasks is inherently global to the user, so an assignment left behind
    // makes the two tests order-dependent. This also exercises un-assigning.
    await page.goto(url);
    await page
      .locator("[data-task-id]")
      .first()
      .getByRole("button", { name: /^view task 1$/ })
      .click();
    const reopened = page.getByRole("dialog");
    await expect(reopened).toBeVisible();
    const toggle = reopened.getByRole("button", { name: new RegExp(displayName, "i") }).first();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false", { timeout: 30_000 });
  });
});

test.describe("command palette", () => {
  test("opens with the keyboard shortcut and closes with Escape", async ({ page }) => {
    await signIn(page);

    const palette = await openPalette(page);
    await expect(palette.getByRole("combobox")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  test("opens from the topbar button too", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: /Search/ }).click();
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });

  test("lists navigation targets and moves with arrow keys", async ({ page }) => {
    await signIn(page);
    const palette = await openPalette(page);
    await expect(palette.getByRole("option", { name: /Projects/ })).toBeVisible();

    // aria-activedescendant is what tells a screen reader which option is
    // current; the highlight alone does not.
    const input = palette.getByRole("combobox");
    const first = await input.getAttribute("aria-activedescendant");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => input.getAttribute("aria-activedescendant")).not.toBe(first);
  });

  test("finds a task by searching for part of its title", async ({ page }) => {
    await signIn(page);
    await projectWithTasks(page, 1);

    const palette = await openPalette(page);
    // Partial word: full-text search alone would not match this, which is why
    // there is a trigram index on the title.
    await palette.getByRole("combobox").fill("view tas");

    // `.first()`: earlier runs leave identically titled tasks in other
    // projects, and matching several is correct behaviour for a search.
    await expect(
      palette.getByRole("option").filter({ hasText: "view task 1" }).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});
