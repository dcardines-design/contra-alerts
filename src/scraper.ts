import { chromium, Browser, Page } from "playwright";
import type { ContraJob } from "./types.js";

const CONTRA_URL = "https://contra.com/discover?view=projects&sort=newest";
const TIMEOUT = 45000;
const MAX_RETRIES = 1;

export async function scrapeContraJobs(): Promise<ContraJob[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}...`);
      }
      return await doScrape();
    } catch (error) {
      lastError = error as Error;
      console.error(`Scrape attempt ${attempt + 1} failed:`, error);
    }
  }

  throw lastError;
}

async function doScrape(): Promise<ContraJob[]> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    page.setDefaultTimeout(TIMEOUT);

    console.log("Navigating to Contra...");
    await page.goto(CONTRA_URL, { waitUntil: "networkidle" });

    // Wait for content to load
    await page.waitForSelector('a[href*="/p/"]', { timeout: 15000 }).catch(() => {
      console.log("No project links found via selector, trying alternative...");
    });

    // Try to extract from Relay cache first
    let jobs = await extractFromRelayCache(page);

    if (jobs.length === 0) {
      console.log("Relay cache extraction failed, falling back to DOM parsing...");
      jobs = await extractFromDOM(page);
    }

    console.log(`Found ${jobs.length} jobs`);
    return jobs;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function extractFromRelayCache(page: Page): Promise<ContraJob[]> {
  try {
    const jobs = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/json"]');
      const results: ContraJob[] = [];

      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || "");

          // Look for Relay record map
          const recordMap =
            data?.props?.pageProps?.publicAppConfiguration?.relayRecordMap ||
            data?.publicAppConfiguration?.relayRecordMap ||
            data?.relayRecordMap;

          if (recordMap && typeof recordMap === "object") {
            for (const [key, value] of Object.entries(recordMap)) {
              const record = value as Record<string, unknown>;
              if (
                record?.__typename === "PortfolioProject" ||
                record?.__typename === "Project"
              ) {
                const slug = (record.slug as string) || key;
                const title = (record.title as string) || (record.name as string) || "";
                const company =
                  (record.clientName as string) ||
                  (record.companyName as string) ||
                  undefined;

                if (title && slug) {
                  results.push({
                    id: slug,
                    title,
                    company,
                    url: `https://contra.com/p/${slug}`,
                    postedAt: (record.createdAt as string) || undefined,
                  });
                }
              }
            }
          }
        } catch {
          // Skip invalid JSON
        }
      }

      return results;
    });

    return jobs;
  } catch (error) {
    console.error("Relay cache extraction error:", error);
    return [];
  }
}

async function extractFromDOM(page: Page): Promise<ContraJob[]> {
  try {
    // Wait a bit more for dynamic content
    await page.waitForTimeout(2000);

    const jobs = await page.evaluate(() => {
      const results: ContraJob[] = [];
      const seen = new Set<string>();

      // Find all project links
      const links = document.querySelectorAll('a[href*="/p/"]');

      for (const link of links) {
        const href = link.getAttribute("href");
        if (!href || !href.startsWith("/p/")) continue;

        const slug = href.replace("/p/", "").split("?")[0].split("/")[0];
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);

        // Try to find title - look for headings or text content
        const card = link.closest("article") || link.closest("div");
        let title = "";
        let company: string | undefined;

        if (card) {
          // Look for heading elements
          const heading = card.querySelector("h2, h3, h4, [class*='title']");
          if (heading) {
            title = heading.textContent?.trim() || "";
          }

          // Look for company/creator name
          const companyEl = card.querySelector("[class*='company'], [class*='creator'], [class*='name']");
          if (companyEl) {
            company = companyEl.textContent?.trim();
          }
        }

        // Fallback: use link text or slug
        if (!title) {
          title = link.textContent?.trim() || slug.replace(/-/g, " ");
        }

        results.push({
          id: slug,
          title,
          company,
          url: `https://contra.com/p/${slug}`,
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
