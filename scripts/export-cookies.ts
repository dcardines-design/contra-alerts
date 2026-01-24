import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function exportCookies() {
  console.log("Launching browser to export cookies...");
  console.log("A browser window will open. Please:");
  console.log("1. Log in to Contra if not already logged in");
  console.log("2. Navigate to https://contra.com/jobs");
  console.log("3. Close the browser window when done\n");

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome" // Use installed Chrome
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://contra.com/jobs");

  // Wait for user to close the browser
  await new Promise<void>((resolve) => {
    browser.on("disconnected", () => resolve());
  });

  // This won't work after browser closes, so let's do it differently
  console.log("\nBrowser closed. Please use the alternative method below.");
}

// Alternative: extract from Chrome directly
async function showInstructions() {
  console.log("=== Export Contra Cookies ===\n");
  console.log("Option 1: Use browser extension");
  console.log("  1. Install 'EditThisCookie' Chrome extension");
  console.log("  2. Go to https://contra.com/jobs (logged in)");
  console.log("  3. Click the extension icon");
  console.log("  4. Click Export (JSON format)");
  console.log("  5. Save the JSON\n");

  console.log("Option 2: Use browser DevTools");
  console.log("  1. Go to https://contra.com/jobs (logged in)");
  console.log("  2. Open DevTools (F12)");
  console.log("  3. Go to Application > Cookies > contra.com");
  console.log("  4. Run this in Console:\n");

  const script = `
// Run this in Chrome DevTools Console on contra.com
const cookies = document.cookie.split(';').map(c => {
  const [name, ...rest] = c.trim().split('=');
  return {
    name,
    value: rest.join('='),
    domain: '.contra.com',
    path: '/'
  };
});
console.log(JSON.stringify(cookies));
copy(JSON.stringify(cookies)); // Copies to clipboard
console.log('Cookies copied to clipboard!');
`;

  console.log(script);
  console.log("\n  5. Paste the JSON into CONTRA_COOKIES secret\n");

  console.log("After getting cookies, add to GitHub:");
  console.log("  gh secret set CONTRA_COOKIES");
  console.log("  (paste the JSON when prompted)");
}

showInstructions();
