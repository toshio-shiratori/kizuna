import { test, expect } from "@playwright/test";
import { gotoWithEnglish } from "./helpers.js";

test.describe("Dashboard", () => {
  test("displays Kizuna Dashboard with stats from seeded data", async ({ page }) => {
    await gotoWithEnglish(page, "#dashboard");

    await expect(page.getByRole("heading", { name: "Kizuna Dashboard" })).toBeVisible();

    // Stats cards: <h2>{title}</h2><div><p>{value}</p></div>. Scope to the
    // heading's parent so we hit the card body, not the sidebar nav link.
    const sessionsCard = page
      .getByRole("heading", { level: 2, name: "Sessions", exact: true })
      .locator("..");
    await expect(sessionsCard).toContainText("2");

    const chunksCard = page
      .getByRole("heading", { level: 2, name: "Chunks", exact: true })
      .locator("..");
    await expect(chunksCard).toContainText("3");

    // Projects card lists both seeded project ids.
    await expect(page.getByText("e2e-project-alpha")).toBeVisible();
    await expect(page.getByText("e2e-project-beta")).toBeVisible();
  });
});
