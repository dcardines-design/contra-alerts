import type { ContraJob, Config } from "./types.js";

export function matchesFilters(job: ContraJob, config: Config): boolean {
  const titleLower = job.title.toLowerCase();
  const companyLower = (job.company || "").toLowerCase();
  const searchText = `${titleLower} ${companyLower}`;

  // Check exclude list first - reject if ANY exclude keyword matches
  if (config.keywords_exclude.length > 0) {
    for (const keyword of config.keywords_exclude) {
      if (searchText.includes(keyword.toLowerCase())) {
        return false;
      }
    }
  }

  // If include list is empty, match all (that passed exclude)
  if (config.keywords_include.length === 0) {
    return true;
  }

  // Check include list - match if ANY include keyword matches
  for (const keyword of config.keywords_include) {
    if (searchText.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export function filterJobs(jobs: ContraJob[], config: Config): ContraJob[] {
  return jobs.filter((job) => matchesFilters(job, config));
}
