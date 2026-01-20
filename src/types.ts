export interface ContraJob {
  id: string;
  title: string;
  company?: string;
  url: string;
  postedAt?: string;
}

export interface Config {
  keywords_include: string[];
  keywords_exclude: string[];
  notification_email: string;
}

export interface SeenJobs {
  jobs: Record<string, { first_seen: string }>;
  last_run: string;
}
