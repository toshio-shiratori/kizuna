import type { Page } from "@playwright/test";

export async function gotoWithEnglish(page: Page, hash: string = ""): Promise<void> {
  // Force English UI for deterministic assertions across CI locales.
  await page.addInitScript(() => {
    window.localStorage.setItem("kizuna-language", "en");
  });
  await page.goto(hash ? `/${hash}` : "/");
}
