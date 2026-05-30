import { test, expect } from "@playwright/test";
import { gotoWithEnglish } from "./helpers.js";

test.describe("Search", () => {
  test("returns the matching chunk for a unique seeded keyword", async ({ page }) => {
    await gotoWithEnglish(page, "#search");

    await expect(page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();

    await page.getByPlaceholder("Search memories...").fill("e2ekeyword");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // The unique seeded chunk shows up in results.
    await expect(page.getByText(/e2ekeyword response for search/)).toBeVisible();
  });

  test("shows the no-results state for a clearly absent query", async ({ page }) => {
    await gotoWithEnglish(page, "#search");

    await page.getByPlaceholder("Search memories...").fill("zzz-absent-token-xyz123");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText("No results found")).toBeVisible();
  });
});
