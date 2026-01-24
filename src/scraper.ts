import { chromium, Browser, Page } from "playwright";
import type { ContraJob } from "./types.js";

const JOBS_URL = "https://contra.com/jobs";
const TIMEOUT = 45000;
const MAX_RETRIES = 1;

export async function scrapeContraJobs(): Promise<ContraJob[]> {
  const cookies = process.env.CONTRA_COOKIES;

  if (!cookies) {
    throw new Error("CONTRA_COOKIES environment variable is required");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}...`);
      }
      return await doScrape(cookies);
    } catch (error) {
      lastError = error as Error;
      console.error(`Scrape attempt ${attempt + 1} failed:`, error);
    }
  }

  throw lastError;
}

async function doScrape(cookiesJson: string): Promise<ContraJob[]> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    // Parse and set cookies
    const cookies = JSON.parse(cookiesJson);
    await context.addCookies(cookies);

    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);

    // Navigate to jobs page
    console.log("Navigating to jobs page...");
    await page.goto(JOBS_URL, { waitUntil: "networkidle" });

    // Check if we're logged in (not redirected to login)
    if (page.url().includes("log-in")) {
      throw new Error("Cookies expired - please refresh CONTRA_COOKIES");
    }

    console.log("Logged in successfully via cookies");

    // Wait for jobs to load
    await page.waitForTimeout(2000);

    // Extract jobs
    let jobs = await extractJobsFromRelay(page);

    if (jobs.length === 0) {
      console.log("Relay extraction failed, trying DOM parsing...");
      jobs = await extractJobsFromDOM(page);
    }

    console.log(`Found ${jobs.length} jobs`);
    return jobs;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function extractJobsFromRelay(page: Page): Promise<ContraJob[]> {
  try {
    const result = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/json"]');
      const jobs: Array<{ id: string; title: string; company?: string; budget?: string; url: string; postedAt?: string }> = [];
      const seen = new Set<string>();

      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        try {
          const text = script.textContent || "";
          if (!text.includes("relayRecordMap")) continue;
          const data = JSON.parse(text);
          if (!data || !data.publicAppConfiguration || !data.publicAppConfiguration.relayRecordMap) continue;
          const config = data.publicAppConfiguration;

          const recordMap = config.relayRecordMap as Record<string, Record<string, unknown>>;

          // Build lookups for orgs and budgets
          const orgNames: Record<string, string> = {};
          const budgets: Record<string, string> = {};

          for (const key of Object.keys(recordMap)) {
            const record = recordMap[key];
            if (!record || !record.__typename) continue;

            if (record.__typename === "Organization" && record.name) {
              orgNames[record.__id as string] = (record.name as string).trim();
            }

            if (record.__typename === "FixedPriceJobBudget" || record.__typename === "HourlyRateJobBudget" || record.__typename === "MonthlyRateJobBudget") {
              const minFee = record.feeMin as string | undefined;
              const maxFee = record.feeMax as string | undefined;
              const min = minFee ? Math.round(parseFloat(minFee.replace("USD:", ""))) : 0;
              const max = maxFee ? Math.round(parseFloat(maxFee.replace("USD:", ""))) : 0;
              if (min && max) {
                const suffix = record.__typename === "HourlyRateJobBudget" ? "/hr" : record.__typename === "MonthlyRateJobBudget" ? "/mo" : "";
                budgets[record.__id as string] = "$" + min.toLocaleString() + " - $" + max.toLocaleString() + suffix;
              }
            }
          }

          // Extract Job records
          for (const key of Object.keys(recordMap)) {
            const record = recordMap[key];
            if (!record || record.__typename !== "Job") continue;

            const title = record.title as string;
            if (!title) continue;

            const id = (record.id as string) || (record.slug as string) || key;
            if (seen.has(id)) continue;
            seen.add(id);

            const slug = record.slug as string;

            // Resolve company
            let company: string | undefined;
            if (record.organization && typeof record.organization === "object") {
              const orgRef = (record.organization as Record<string, unknown>).__ref as string;
              if (orgRef) company = orgNames[orgRef];
            }

            // Resolve budget
            let budget: string | undefined;
            if (record.budget && typeof record.budget === "object") {
              const budgetRef = (record.budget as Record<string, unknown>).__ref as string;
              if (budgetRef) budget = budgets[budgetRef];
            }

            jobs.push({
              id,
              title,
              company,
              budget,
              url: `https://contra.com/opportunity/${slug}`,
              postedAt: (record.createdAt as string) || undefined,
            });
          }
        } catch {
          // Skip invalid script tags
        }
      }

      return jobs;
    });

    return result;
  } catch (error) {
    console.error("Relay extraction error:", String(error));
    return [];
  }
}

async function extractJobsFromDOM(page: Page): Promise<ContraJob[]> {
  try {
    const jobs = await page.evaluate(() => {
      const results: ContraJob[] = [];
      const seen = new Set<string>();

      // Find job cards by the OpportunityPost component
      const cards = document.querySelectorAll('[data-sentry-component="OpportunityPost"]');

      for (const card of cards) {
        // Extract company from aria-label: "View opportunity from {Company}"
        const ariaLabel = card.getAttribute("aria-label") || "";
        const companyMatch = ariaLabel.match(/View opportunity from\s+(.+)/);
        const company = companyMatch ? companyMatch[1].trim() : undefined;

        // Extract title from the <p> element within the card
        const titleEl = card.querySelector("p");
        const title = titleEl?.textContent?.trim() || "";
        if (!title) continue;

        // Extract budget - look for text containing $ sign
        const cardText = card.innerText || "";
        const budgetMatch = cardText.match(/(\$[\d,]+ - \$[\d,]+(?:\/hr|\/mo)?[^\\n]*)/);
        const budget = budgetMatch ? budgetMatch[1].trim() : undefined;

        // Generate a stable ID from the title
        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 80);
        if (seen.has(id)) continue;
        seen.add(id);

        results.push({
          id,
          title,
          company,
          budget,
          url: `https://contra.com/jobs`,
        });
      }

      return results;
    });

    return jobs;
  } catch (error) {
    console.error("DOM extraction error:", error);
    return [];
  }
}
