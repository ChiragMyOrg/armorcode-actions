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
  
  // Determine status emoji
  const statusEmoji = status === "PASS" ? "✅" : "❌";
  const slaEmoji = slaStatus === "PASSED" ? "✅" : "❌";
  
  // Create summary message
  let summaryMsg = `### ArmorCode Release Gate ${statusEmoji} ${status}\n\n`;
  
  // Add severity counts with appropriate emojis
  summaryMsg += "#### Security Issues:\n";
  summaryMsg += `- 🔴 Critical: ${severity.Critical || 0}\n`;
  summaryMsg += `- 🟠 High: ${severity.High || 0}\n`;
  summaryMsg += `- 🟡 Medium: ${severity.Medium || 0}\n`;
  summaryMsg += `- 🟢 Low: ${severity.Low || 0}\n\n`;
  
  // Add SLA status
  summaryMsg += `#### SLA Status: ${slaEmoji} ${slaStatus}\n\n`;
  
  // Add details link
  summaryMsg += `[View Details in ArmorCode](${detailsLink})\n`;
  
  // Output to GitHub Actions summary
  core.summary
    .addRaw(summaryMsg)
    .write();
  
  // Also output as notice or error depending on status
  if (status === "PASS") {
    core.notice(summaryMsg);
  } else {
    core.error(summaryMsg);
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