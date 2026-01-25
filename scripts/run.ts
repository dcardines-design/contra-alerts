import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { scrapeContraJobs } from "../src/scraper.js";
import { filterJobs } from "../src/filter.js";
import { sendNotification } from "../src/notifier.js";
import type { Config, SeenJobs, ContraJob } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");
const SEEN_JOBS_PATH = path.join(ROOT_DIR, "data", "seen-jobs.json");

async function main() {
  console.log("=== Contra Alerts ===");
  console.log(`Time: ${new Date().toISOString()}`);

  // Load config
  const config = loadConfig();
  console.log(`Include keywords: ${config.keywords_include.join(", ") || "(none)"}`);
  console.log(`Exclude keywords: ${config.keywords_exclude.join(", ") || "(none)"}`);

  // Load seen jobs
  const seenJobs = loadSeenJobs();
  console.log(`Previously seen jobs: ${Object.keys(seenJobs.jobs).length}`);

  // Scrape jobs
  console.log("\nScraping Contra...");
  const allJobs = await scrapeContraJobs();
  console.log(`Total jobs scraped: ${allJobs.length}`);

  // Filter by keywords
  const matchingJobs = filterJobs(allJobs, config);
  console.log(`Jobs matching filters: ${matchingJobs.length}`);

  // Find new jobs (not seen before by ID or title)
  const normalizeTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 100);
  const newJobs = matchingJobs.filter((job) => {
    const titleKey = normalizeTitle(job.title);
    return !seenJobs.jobs[job.id] && !seenJobs.titles[titleKey];
  });
  console.log(`New jobs: ${newJobs.length}`);

  // Send notification if there are new jobs
  if (newJobs.length > 0) {
    const notificationEmail =
      process.env.NOTIFICATION_EMAIL || config.notification_email;

    if (notificationEmail) {
      await sendNotification(newJobs, notificationEmail);
    } else {
      console.log("No notification email configured, skipping notification");
      console.log("\nNew jobs found:");
      newJobs.forEach((job) => {
        console.log(`  - ${job.title} (${job.url})`);
      });
    }
  } else {
    console.log("No new jobs to notify about");
  }

  // Update seen jobs (track both IDs and titles)
  const now = new Date().toISOString();
  for (const job of allJobs) {
    if (!seenJobs.jobs[job.id]) {
      seenJobs.jobs[job.id] = { first_seen: now };
    }
    const titleKey = normalizeTitle(job.title);
    if (!seenJobs.titles[titleKey]) {
      seenJobs.titles[titleKey] = { first_seen: now };
    }
  }
  seenJobs.last_run = now;

  // Prune old jobs and titles (keep last 30 days worth)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const prunedJobs: Record<string, { first_seen: string }> = {};
  for (const [id, data] of Object.entries(seenJobs.jobs)) {
    if (data.first_seen >= thirtyDaysAgo) {
      prunedJobs[id] = data;
    }
  }
  seenJobs.jobs = prunedJobs;

  const prunedTitles: Record<string, { first_seen: string }> = {};
  for (const [title, data] of Object.entries(seenJobs.titles)) {
    if (data.first_seen >= thirtyDaysAgo) {
      prunedTitles[title] = data;
    }
  }
  seenJobs.titles = prunedTitles;

  // Save seen jobs
  saveSeenJobs(seenJobs);
  console.log(`\nSaved ${Object.keys(seenJobs.jobs).length} jobs to seen-jobs.json`);

  console.log("\n=== Done ===");
}

function loadConfig(): Config {
  const defaultConfig: Config = {
    keywords_include: ["designer", "figma", "product design", "ux", "ui", "brand"],
    keywords_exclude: [],
    notification_email: "",
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      return { ...defaultConfig, ...data };
    }
  } catch (error) {
    console.warn("Failed to load config.json, using defaults:", error);
  }

  return defaultConfig;
}

function loadSeenJobs(): SeenJobs {
  const defaultSeenJobs: SeenJobs = {
    jobs: {},
    titles: {},
    last_run: "",
  };

  try {
    if (fs.existsSync(SEEN_JOBS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SEEN_JOBS_PATH, "utf-8"));
      return { ...defaultSeenJobs, ...data };
    }
  } catch (error) {
    console.warn("Failed to load seen-jobs.json, starting fresh:", error);
  }

  return defaultSeenJobs;
}

function saveSeenJobs(seenJobs: SeenJobs): void {
  const dir = path.dirname(SEEN_JOBS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SEEN_JOBS_PATH, JSON.stringify(seenJobs, null, 2));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
