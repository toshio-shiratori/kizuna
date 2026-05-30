import { test, expect } from "@playwright/test";
import { gotoWithEnglish } from "./helpers.js";

test.describe("Session Browser", () => {
  test("lists seeded sessions and opens detail view with chunks", async ({ page }) => {
    await gotoWithEnglish(page, "#sessions");

    await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();

    // Both seeded projects appear in the list.
    await expect(page.getByText("e2e-project-alpha")).toBeVisible();
    await expect(page.getByText("e2e-project-beta")).toBeVisible();

    // Open detail for the first session by clicking its row.
    await page.getByText("e2e-project-alpha").first().click();

    // Detail view shows the seeded chunk content.
    await expect(page.getByText("Hello from the E2E user turn.")).toBeVisible();
    await expect(page.getByText("This is a unique e2ekeyword response for search.")).toBeVisible();
  });
});
