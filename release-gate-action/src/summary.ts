import * as core from '@actions/core'
import * as github from '@actions/github'
import axios from 'axios'

/**
 * Creates a summary message and posts it to the GitHub Actions summary
 * and as a comment to the pull request if applicable.
 */
export async function createSummary(
    responseJson: any,
    detailsLink: string,
    githubToken: string
  ): Promise<void> {
    const status = responseJson.status;
    const severity = responseJson.severity || {};
    const slaStatus = responseJson.slaStatus;
    
    // Create a more visually appealing summary
    let summaryMsg = '';
    
    // Header with large emoji and status
    const statusEmoji = status === "PASS" ? "✅" : "❌";
    const statusColor = status === "PASS" ? "green" : "red";
    summaryMsg += `<h1 align="center">${statusEmoji} ArmorCode Release Gate</h1>\n\n`;
    summaryMsg += `<h2 align="center"><code style="color:${statusColor}">${status}</code></h2>\n\n`;
    
    // Security issues in a more styled table
    summaryMsg += `<h3 align="center">Security Issues</h3>\n\n`;
    summaryMsg += `<table align="center">\n`;
    summaryMsg += `  <tr>\n    <th>Severity</th>\n    <th>Count</th>\n    <th>Status</th>\n  </tr>\n`;
    
    // Add rows with conditional styling
    const criticalCount = severity.Critical || 0;
    const highCount = severity.High || 0;
    const mediumCount = severity.Medium || 0;
    const lowCount = severity.Low || 0;
    
    summaryMsg += `  <tr>\n    <td>🔴 Critical</td>\n    <td align="center"><b>${criticalCount}</b></td>\n    <td>${criticalCount > 0 ? "❗️" : "✓"}</td>\n  </tr>\n`;
    summaryMsg += `  <tr>\n    <td>🟠 High</td>\n    <td align="center"><b>${highCount}</b></td>\n    <td>${highCount > 0 ? "⚠️" : "✓"}</td>\n  </tr>\n`;
    summaryMsg += `  <tr>\n    <td>🟡 Medium</td>\n    <td align="center"><b>${mediumCount}</b></td>\n    <td>${mediumCount > 0 ? "⚠️" : "✓"}</td>\n  </tr>\n`;
    summaryMsg += `  <tr>\n    <td>🟢 Low</td>\n    <td align="center"><b>${lowCount}</b></td>\n    <td>${lowCount > 0 ? "ℹ️" : "✓"}</td>\n  </tr>\n`;
    summaryMsg += `</table>\n\n`;
    
    // SLA status with badge-like appearance
    const slaEmoji = slaStatus === "PASSED" ? "✅" : "❌";
    const slaColor = slaStatus === "PASSED" ? "green" : "red";
    summaryMsg += `<p align="center"><b>SLA Status:</b> <code style="background-color:${slaColor};color:white;padding:3px 6px;border-radius:3px">${slaEmoji} ${slaStatus}</code></p>\n\n`;
    
    // Add details link with button-like appearance
    const link = detailsLink || responseJson.detailsLink || responseJson.link || "";
    if (link) {
      summaryMsg += `<p align="center"><a href="${link}" target="_blank"><img alt="View in ArmorCode" src="https://img.shields.io/badge/View_Details-ArmorCode-blue?style=for-the-badge"></a></p>\n\n`;
    }
    
    // Output to GitHub Actions summary
    core.summary
      .addRaw(summaryMsg)
      .write();
    
    // Also output as notice or error depending on status
    if (status === "PASS") {
      core.notice(`ArmorCode Release Gate: ${status}`);
    } else {
      core.error(`ArmorCode Release Gate: ${status}`);
    }
    
    // Post comment to PR if this is a pull request event
    await postCommentToPullRequest(summaryMsg, githubToken);
  }

/**
 * Posts a comment to the pull request if the action is triggered by a PR event
 */
async function postCommentToPullRequest(
  message: string,
  githubToken: string
): Promise<void> {
  const context = github.context;
  
  // Check if this is a pull request event
  const isPullRequest = context.payload.pull_request ?? null;
  if (!isPullRequest) {
    core.debug('Not a pull request event, skipping PR comment');
    return;
  }
  
  try {
    const octokit = github.getOctokit(githubToken);
    
    // Get PR number from context
    const prNumber = context.payload?.pull_request?.number;

    if (prNumber !== undefined) {
        await octokit.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber,
          body: message
        });
      } else {
        core.warning('Failed to get PR number');
      }
    
    core.info(`Posted ArmorCode release gate results to PR #${prNumber}`);
  } catch (error) {
    core.warning(`Failed to post comment to pull request: ${error instanceof Error ? error.message : String(error)}`);
  }
}