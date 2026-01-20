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
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <a href="${job.url}" style="color: #2563eb; text-decoration: none; font-weight: 500;">
            ${escapeHtml(job.title)}
          </a>
          ${job.company ? `<br><span style="color: #666; font-size: 14px;">${escapeHtml(job.company)}</span>` : ""}
          ${job.postedAt ? `<br><span style="color: #999; font-size: 12px;">${formatDate(job.postedAt)}</span>` : ""}
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
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: #2563eb; color: white; padding: 20px;">
          <h1 style="margin: 0; font-size: 20px;">🔔 New Contra Jobs Alert</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${jobs.length} new job${jobs.length === 1 ? "" : "s"} matching your filters</p>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          ${jobsHtml}
        </table>
        <div style="padding: 16px; background: #f9fafb; text-align: center; color: #666; font-size: 12px;">
          <a href="https://contra.com/discover?view=projects&sort=newest" style="color: #2563eb; text-decoration: none;">
            View all jobs on Contra →
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
    subject: `🔔 ${jobs.length} New Contra Job${jobs.length === 1 ? "" : "s"} Found`,
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
