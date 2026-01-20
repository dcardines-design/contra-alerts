# Contra Alerts

Automated job alerts from [Contra](https://contra.com) with keyword filtering and email notifications.

## Features

- Scrapes Contra job board every 30 minutes via GitHub Actions
- Filters jobs by keywords (include/exclude lists)
- Sends email notifications for new matches via Resend
- Tracks seen jobs to avoid duplicates
- Zero infrastructure cost (runs entirely on GitHub Actions)

## Setup

### 1. Fork/Clone this repository

### 2. Install dependencies locally (optional, for testing)

```bash
npm install
npx playwright install chromium
```

### 3. Configure filters

Edit `config.json` to customize your job alerts:

```json
{
  "keywords_include": ["designer", "figma", "product design", "ux", "ui", "brand"],
  "keywords_exclude": ["senior", "lead", "manager"],
  "notification_email": "your@email.com"
}
```

- **keywords_include**: Jobs matching ANY of these keywords will be included (empty = match all)
- **keywords_exclude**: Jobs matching ANY of these keywords will be excluded
- **notification_email**: Fallback email (can be overridden by `NOTIFICATION_EMAIL` secret)

### 4. Set up GitHub Secrets

Go to your repository's Settings > Secrets and variables > Actions, and add:

| Secret | Description |
|--------|-------------|
| `RESEND_API_KEY` | Your [Resend](https://resend.com) API key |
| `NOTIFICATION_EMAIL` | Email address to receive alerts |

### 5. Enable GitHub Actions

The workflow runs automatically every 30 minutes. You can also trigger it manually from the Actions tab.

## Local Testing

```bash
# Run the scraper locally
npm start

# Or with environment variables
RESEND_API_KEY=re_xxx NOTIFICATION_EMAIL=you@email.com npm start
```

## Project Structure

```
contra-alerts/
├── src/
│   ├── scraper.ts      # Playwright scraper for Contra
│   ├── notifier.ts     # Email notification via Resend
│   ├── filter.ts       # Keyword matching logic
│   └── types.ts        # TypeScript interfaces
├── scripts/
│   └── run.ts          # Main entry point
├── data/
│   └── seen-jobs.json  # Tracked job IDs (auto-updated)
├── .github/
│   └── workflows/
│       └── scrape.yml  # GitHub Actions workflow
├── config.json         # User configuration
├── package.json
└── tsconfig.json
```

## How It Works

1. GitHub Actions triggers the scraper every 30 minutes
2. Playwright navigates to Contra's discover page
3. Jobs are extracted from the page (Relay cache or DOM)
4. Jobs are filtered against your keyword configuration
5. New jobs (not previously seen) trigger an email notification
6. Seen job IDs are committed back to the repository

## License

MIT
