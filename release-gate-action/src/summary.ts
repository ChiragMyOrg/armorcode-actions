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
    
    // Extract product information from inputs or response
    const product = process.env.INPUT_PRODUCT || responseJson.productId || '';
    const subProduct = process.env.INPUT_SUBPRODUCT || responseJson.subProductId || '';
    const environment = process.env.INPUT_ENV || 'Production';
    const failureReason = responseJson.failureReasonText || (status !== "PASS" ? "Security policy violation" : "");
    
    // Create a professional summary
    let summaryMsg = '';
    
    // Single professional heading
    const statusEmoji = status === "PASS" ? "✅" : "❌";
    summaryMsg += `<h2>ArmorCode Release Gate Summary ${statusEmoji}</h2>\n\n`;
    
    // Product information section
    summaryMsg += `<h3>Product Information</h3>\n`;
    summaryMsg += `<table>\n`;
    summaryMsg += `  <tr>\n    <th align="left">Property</th>\n    <th align="left">Value</th>\n  </tr>\n`;
    summaryMsg += `  <tr>\n    <td>Product</td>\n    <td><b>${product}</b></td>\n  </tr>\n`;
    summaryMsg += `  <tr>\n    <td>Sub Product</td>\n    <td><b>${subProduct}</b></td>\n  </tr>\n`;
    summaryMsg += `  <tr>\n    <td>Environment</td>\n    <td><b>${environment}</b></td>\n  </tr>\n`;
    summaryMsg += `</table>\n\n`;
    
    // Status information
    const statusColor = status === "PASS" ? "green" : "red";
    summaryMsg += `<h3>Gate Status</h3>\n`;
    summaryMsg += `<p><strong>Status:</strong> <code style="color:${statusColor}">${status}</code></p>\n`;
    
    // Add failure reason if present
    if (failureReason && status !== "PASS") {
      summaryMsg += `<p><strong>Reason:</strong> ${failureReason}</p>\n\n`;
    }
    
    // Security issues in a clean table
    summaryMsg += `<h3>Security Issues</h3>\n`;
    summaryMsg += `<table>\n`;
    summaryMsg += `  <tr>\n    <th align="left">Severity</th>\n    <th align="left">Count</th>\n    <th align="left">Status</th>\n  </tr>\n`;
    
    // Add rows with conditional styling
    const criticalCount = severity.Critical || 0;
    const highCount = severity.High || 0;
    const mediumCount = severity.Medium || 0;
    const lowCount = severity.Low || 0;
    
    summaryMsg += `  <tr>\n    <td>🔴 Critical</td>\n    <td><b>${criticalCount}</b></td>\n    <td>${criticalCount > 0 ? "❗️" : "✓"}</td>\n  </tr>\n`;
    summaryMsg += `  <tr>\n    <td>🟠 High</td>\n    <td><b>${highCount}</b></td>\n    <td>${highCount > 0 ? "⚠️" : "✓"}</td>\n  </tr>\n`;
    summaryMsg += `  <tr>\n    <td>🟡 Medium</td>\n    <td><b>${mediumCount}</b></td>\n    <td>${mediumCount > 0 ? "⚠️" : "✓"}</td>\n  </tr>\n`;
    summaryMsg += `  <tr>\n    <td>🟢 Low</td>\n    <td><b>${lowCount}</b></td>\n    <td>${lowCount > 0 ? "ℹ️" : "✓"}</td>\n  </tr>\n`;
    summaryMsg += `</table>\n\n`;
    
    // SLA status with clean formatting
    const slaEmoji = slaStatus === "PASSED" ? "✅" : "❌";
    const slaColor = slaStatus === "PASSED" ? "green" : "red";
    summaryMsg += `<p><strong>SLA Status:</strong> <code style="color:${slaColor}">${slaStatus} ${slaEmoji}</code></p>\n\n`;
    
    // Add details link with professional appearance
    const link = detailsLink || responseJson.detailsLink || responseJson.link || "";
    if (link) {
      summaryMsg += `<p><a href="${link}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;"><strong>View Complete Analysis in ArmorCode →</strong></a></p>\n\n`;
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