import { test, expect } from "@playwright/test";

test.describe("Debug Panel", () => {
  test("should add gold and show a toast message", async ({ page }) => {
    // Navigate to the game's main page
    await page.goto("/");

    // Find the button in the debug panel and click it
    const addGoldButton = page.locator("#debug-add-gold");
    await addGoldButton.click();

    // Check if the success toast message appears
    const toast = page.locator("#toast-area");
    await expect(toast).toContainText("+1000 de ouro adicionado para depuração.");
  });

  test("should save the game manually and show a success message", async ({ page }) => {
    await page.goto("/");

    // Open the saves tab
    await page.click("#open-saves-btn");

    // Click the manual save button
    await page.click("#manual-save-btn");

    // Check if the success toast message appears
    const toast = page.locator("#toast-area");
    await expect(toast).toContainText("Save manual concluído.");
  });
});
