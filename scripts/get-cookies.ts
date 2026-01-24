import { chromium } from "playwright";
import * as os from "os";
import * as path from "path";

async function getCookies() {
  console.log("Opening Chrome with your profile - you should already be logged in...\n");

  // Use Chrome with your existing profile
  const userDataDir = path.join(os.homedir(), "Library/Application Support/Google/Chrome");

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome",
    args: ["--profile-directory=Default"],
  });

  const page = await browser.newPage();

  await page.goto("https://contra.com/log-in");

  console.log("1. The browser should open with your existing Chrome session");
  console.log("2. Make sure you're on https://contra.com/jobs and logged in");
  console.log("3. Press Enter here when ready\n");

  // Wait for user input
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  // Get all cookies including httpOnly
  const cookies = await browser.cookies();

  // Filter to contra.com cookies
  const contraCookies = cookies.filter(c => c.domain.includes("contra.com"));

  console.log("\n=== COOKIES (copy everything below) ===\n");
  console.log(JSON.stringify(contraCookies));
  console.log("\n=== END COOKIES ===\n");

  console.log("Now run: gh secret set CONTRA_COOKIES");
  console.log("And paste the JSON above.\n");

  await browser.close();
}

getCookies().catch(console.error);
