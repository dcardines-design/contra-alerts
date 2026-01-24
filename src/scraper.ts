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
    const jobs = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/json"]');
      const results: ContraJob[] = [];
      const seen = new Set<string>();

      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || "");

          // Look for Relay record map in multiple locations
          const findRecordMap = (obj: unknown): Record<string, unknown> | null => {
            if (!obj || typeof obj !== "object") return null;
            const o = obj as Record<string, unknown>;
            if (o.relayRecordMap) return o.relayRecordMap as Record<string, unknown>;
            // Direct publicAppConfiguration path
            if (o.publicAppConfiguration && typeof o.publicAppConfiguration === "object") {
              const config = o.publicAppConfiguration as Record<string, unknown>;
              if (config.relayRecordMap) return config.relayRecordMap as Record<string, unknown>;
            }
            // Nested under props.pageProps
            if (o.props && typeof o.props === "object") {
              const props = o.props as Record<string, unknown>;
              if (props.pageProps && typeof props.pageProps === "object") {
                const pageProps = props.pageProps as Record<string, unknown>;
                if (pageProps.publicAppConfiguration && typeof pageProps.publicAppConfiguration === "object") {
                  const config = pageProps.publicAppConfiguration as Record<string, unknown>;
                  if (config.relayRecordMap) return config.relayRecordMap as Record<string, unknown>;
                }
              }
            }
            return null;
          };

          const recordMap = findRecordMap(data);
          if (!recordMap) continue;

          // Build a lookup for Organization names
          const orgNames: Record<string, string> = {};
          for (const [, value] of Object.entries(recordMap)) {
            const record = value as Record<string, unknown>;
            if (record?.__typename === "Organization" && record.name) {
              orgNames[record.__id as string] = (record.name as string).trim();
            }
          }

          // Extract Job records
          for (const [, value] of Object.entries(recordMap)) {
            const record = value as Record<string, unknown>;
            if (record?.__typename !== "Job") continue;

            const title = record.title as string;
            if (!title) continue;

            const id = (record.id as string) || (record.slug as string);
            if (seen.has(id)) continue;
            seen.add(id);

            const slug = record.slug as string;

            // Resolve company name from organization ref
            let company: string | undefined;
            if (record.organization && typeof record.organization === "object") {
              const orgRef = (record.organization as Record<string, unknown>).__ref as string;
              if (orgRef && orgNames[orgRef]) {
                company = orgNames[orgRef];
              }
            }

            results.push({
              id,
              title,
              company,
              url: `https://contra.com/opportunity/${slug}`,
              postedAt: record.createdAt as string || undefined,
            });
          }
        } catch {
          // Skip invalid JSON
        }
      }

      return results;
    });

    return jobs;
  } catch (error) {
    console.error("Relay extraction error:", error);
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
