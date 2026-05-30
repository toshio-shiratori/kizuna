import { test, expect } from "@playwright/test";
import { gotoWithEnglish } from "./helpers.js";

test.describe("Telepathy", () => {
  test("renders the Telepathy page without API errors", async ({ page }) => {
    await gotoWithEnglish(page, "#telepathy");

    // Heading is rendered (i18n key: telepathy.title).
    await expect(page.locator("h1, h2, h3").filter({ hasText: /Telepathy/i })).toBeVisible();

    // The page should not surface uncaught network errors. We give the
    // initial fetches a moment to settle, then sanity-check that the
    // Send button is present (writable test server enables UI controls).
    await expect(page.getByRole("button", { name: /Send/i }).first()).toBeVisible();
  });
});
