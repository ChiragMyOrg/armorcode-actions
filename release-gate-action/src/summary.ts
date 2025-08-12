import * as core from '@actions/core'
import * as github from '@actions/github'
import axios from 'axios'

/**
 * Creates a summary message and posts it to the GitHub Actions summary
 * and as a comment to the pull request if applicable.
 */
export async function createSummary(
    product: string,
    subProduct: string,
    env: string,
    responseJson: any,
    detailsLink: string,
    githubToken: string,
    mode?: string 
  ): Promise<void> {
    const status = responseJson.status;
    const severity = responseJson.severity || {};
    const slaStatus = responseJson.slaStatus;
    const failureReason = responseJson.failureReasonText || "";
    
    // Create a professional summary
    let summaryMsg = '';
    
    // Status heading with emoji
    const isWarnMode = mode?.toLowerCase() === 'warn';
    const statusEmoji = status === "PASS" ? "✅" : isWarnMode ? "⚠️" : "❌";
    const statusText = status === "PASS" ? "ArmorCode Release Gate Passed" : "ArmorCode Release Gate Failed";
    summaryMsg += `### ${statusEmoji} ${statusText}\n`;

    // Add special message for PASS case
    if (status === "PASS") {
      summaryMsg += "No findings that breach the ArmorCode Release Gate were found.\n";
    }

    // Add warning mode note
    if (status !== "PASS" && isWarnMode) {
      summaryMsg += "Note: ArmorCode Release Gate is currently running in warning mode.\n";
    }
    
    // Product information as bullet points
    summaryMsg += `* **Product:** ${product}\n`;
    summaryMsg += `* **Sub Product:** ${subProduct}\n`;
    summaryMsg += `* **Environment:** ${env}\n`;
    
    // Add failure reason if present
    if (failureReason && status !== "PASS") {
      summaryMsg += `* **Reason:** ${failureReason}\n`;
    }
    
    // Only add findings summary if not PASS
    if (status !== "PASS") {
      summaryMsg += '\n**Findings Summary:**\n\n';
      
      // Security issues in HTML table format - without status indicators
      summaryMsg += `<table>\n`;
      summaryMsg += `  <tr>\n    <th>Severity</th>\n    <th>Count</th>\n  </tr>\n`;
      
      // Add rows with severity counts
      const criticalCount = severity.Critical || 0;
      const highCount = severity.High || 0;
      const mediumCount = severity.Medium || 0;
      const lowCount = severity.Low || 0;
      
      summaryMsg += `  <tr>\n    <td>🔴 Critical</td>\n    <td><b>${criticalCount}</b></td>\n  </tr>\n`;
      summaryMsg += `  <tr>\n    <td>🟠 High</td>\n    <td><b>${highCount}</b></td>\n  </tr>\n`;
      summaryMsg += `  <tr>\n    <td>🟡 Medium</td>\n    <td><b>${mediumCount}</b></td>\n  </tr>\n`;
      summaryMsg += `  <tr>\n    <td>🟢 Low</td>\n    <td><b>${lowCount}</b></td>\n  </tr>\n`;
      summaryMsg += `</table>\n\n`;
      
      // Add details link that opens in a new tab
      const link = detailsLink || responseJson.detailsLink || responseJson.link || "";
      if (link) {
          summaryMsg += `<a href="${link}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">**View Findings in ArmorCode →**</a>\n\n`;
      }
    }
    
    try {
      // Clear any existing summary first
      await core.summary.clear();
      
      // Write to GitHub Actions summary (appears in Checks tab)
      await core.summary
        .addRaw(summaryMsg)
        .write();
      
    } catch (error) {
      core.warning(`Failed to write to GitHub Actions summary: ${error instanceof Error ? error.message : String(error)}`);
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
    // core.debug('Not a pull request event, skipping PR comment');
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
      }
    
  } catch (error) {
    // core.warning(`Failed to post comment to pull request: ${error instanceof Error ? error.message : String(error)}`);
  }
}