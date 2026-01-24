import { chromium } from "playwright";

async function checkJobsPage() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("Navigating to contra.com/jobs...");
  await page.goto("https://contra.com/jobs", { waitUntil: "networkidle" });

  console.log("Title:", await page.title());
  console.log("URL:", page.url());

  // Check for job-related links
  const links = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll("a[href]"));
    return allLinks
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && (h.includes("job") || h.includes("opportunity")))
      .slice(0, 20);
  });
  console.log("Job/opportunity links:", links);

  // Look for job cards by examining the page structure
  const jobData = await page.evaluate(() => {
    // Look for Relay cache data
    const scripts = document.querySelectorAll('script[type="application/json"]');
    const results: string[] = [];

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || "");
        const str = JSON.stringify(data);
        if (str.includes("Job") || str.includes("Opportunity")) {
          // Find relevant type names
          const typeMatches = str.match(/"__typename":"[^"]+"/g);
          if (typeMatches) {
            results.push(...new Set(typeMatches));
          }
        }
      } catch {}
    }
    return results.slice(0, 30);
  });
  console.log("Type names found:", jobData);

  // Get visible text that looks like job titles
  const visibleJobs = await page.evaluate(() => {
    const elements = document.querySelectorAll("h1, h2, h3, h4, [class*='title'], [class*='Title']");
    return Array.from(elements)
      .map((el) => el.textContent?.trim())
      .filter((t) => t && t.length > 5 && t.length < 100)
      .slice(0, 20);
  });
  console.log("Visible titles:", visibleJobs);

  await browser.close();
}

checkJobsPage().catch(console.error);
