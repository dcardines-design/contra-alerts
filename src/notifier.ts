import { Resend } from "resend";
import type { ContraJob } from "./types.js";

export async function sendNotification(
  jobs: ContraJob[],
  toEmail: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is required");
  }

  if (jobs.length === 0) {
    console.log("No jobs to notify about");
    return;
  }

  const resend = new Resend(apiKey);

  const jobsHtml = jobs
    .map(
      (job) => `
      <tr>
        <td style="padding: 20px 24px; border-bottom: 1px solid #1a1a1a;">
          <a href="${job.url}" style="color: #ffffff; text-decoration: none; font-weight: 500; font-size: 16px; letter-spacing: -0.2px;">
            ${escapeHtml(job.title)}
          </a>
          ${job.company ? `<div style="color: #888; font-size: 13px; margin-top: 6px;">${escapeHtml(job.company)}</div>` : ""}
          ${job.budget ? `<div style="color: #4ade80; font-size: 13px; margin-top: 4px;">${escapeHtml(job.budget)}</div>` : ""}
          ${job.postedAt ? `<div style="color: #555; font-size: 12px; margin-top: 4px;">${formatDate(job.postedAt)}</div>` : ""}
        </td>
      </tr>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 32px 16px; background: #000000;">
      <div style="max-width: 560px; margin: 0 auto; background: #0a0a0a; border-radius: 12px; overflow: hidden; border: 1px solid #1a1a1a;">
        <div style="padding: 32px 24px 24px;">
          <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #ffffff; letter-spacing: -0.3px;">New Jobs</h1>
          <p style="margin: 6px 0 0; color: #666; font-size: 13px;">${jobs.length} match${jobs.length === 1 ? "" : "es"} found</p>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          ${jobsHtml}
        </table>
        <div style="padding: 20px 24px; text-align: center;">
          <a href="https://contra.com/jobs" style="color: #888; text-decoration: none; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
            View all on Contra &rarr;
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = jobs
    .map(
      (job) =>
        `${job.title}${job.company ? ` - ${job.company}` : ""}\n${job.url}`
    )
    .join("\n\n");

  console.log(`Sending notification for ${jobs.length} jobs to ${toEmail}...`);

  const { error } = await resend.emails.send({
    from: "Contra Alerts <onboarding@resend.dev>",
    to: toEmail,
    subject: `${jobs.length} new job${jobs.length === 1 ? "" : "s"} on Contra`,
    html,
    text,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.log("Notification sent successfully");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}
