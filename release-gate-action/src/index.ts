import * as core from '@actions/core';
import * as github from '@actions/github';
import axios from 'axios';

/**
 * Main function that runs the ArmorCode Release Gate action
 */
async function run(): Promise<void> {
  try {
    // Get inputs from action
    const groupName = core.getInput('group_name', { required: true });
    const subGroupName = core.getInput('sub_group_name', { required: true });
    const environment = core.getInput('environment', { required: true });
    const mode = core.getInput('mode', { required: true });
    const additionalAQLFilters = core.getInput('aql');
    const armorCodeToken = core.getInput('armorcode_token', { required: true });
    const maxRetries = parseInt(core.getInput('max_retries') || '5', 10);
    const apiUrl = core.getInput('api_url') || 'https://app.armorcode.com';

    // Get GitHub context
    const context = github.context;
    const buildNumber = context.runNumber.toString();
    const jobName = context.job;
    const repoName = context.repo.repo;
    const repoOwner = context.repo.owner;
    const jobUrl = `https://github.com/${repoOwner}/${repoName}/actions/runs/${context.runId}`;

    // Log initial context
    core.info('=== Starting ArmorCode Release Gate Check ===');
    core.info(`group=${groupName}, subGroup=${subGroupName}, env=${environment}, maxRetries=${maxRetries}, mode=${mode}`);
    
    // Poll up to maxRetries times
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        core.info(`Attempt ${attempt}/${maxRetries}`);
        
        // Make the HTTP POST request to ArmorCode
        const response = await postArmorCodeRequest(
          armorCodeToken,
          buildNumber,
          jobName,
          attempt,
          maxRetries,
          apiUrl,
          jobUrl,
          groupName,
          subGroupName,
          environment,
          aql
        );
        
        const status = response.status || 'UNKNOWN';
        core.info('=== ArmorCode Release Gate ===');
        core.info(`Status: ${status}`);
        
        if (status === 'HOLD') {
          // On HOLD => wait 20 seconds, then retry
          core.info('[INFO] SLA is on HOLD. Sleeping 20s...');
          core.info('[INFO] Sleeping 20 seconds before trying again. You can temporarily release the build from ArmorCode console');
          await sleep(20000);
        } else if (status === 'FAILED') {
          // SLA failure => provide detailed error with links
          const detailedError = formatDetailedErrorMessage(
            response,
            groupName,
            subGroupName,
            environment,
            buildNumber,
            jobName,
            jobUrl
          );
          core.info(detailedError);
          
          // Handle failure based on mode
          if (mode.toLowerCase() === 'block') {
            core.setFailed('[BLOCK] SLA check FAILED => Terminating workflow with failure.');
            return;
          } else if (mode.toLowerCase() === 'warn') {
            core.warning('[WARN] SLA check FAILED but "warn" mode is active => Marking as warning and continuing...');
            break;
          }
        } else {
          // SUCCESS or RELEASE or other statuses => pass and break out
          core.info('[INFO] ArmorCode check passed! Proceeding...');
          return;
        }
      } catch (error) {
        if (error instanceof Error) {
          core.error(`[ERROR] ArmorCode request failed: ${error.message}`);
        } else {
          core.error(`[ERROR] ArmorCode request failed with unknown error`);
        }
        
        // If we've tried all retries, fail the workflow
        if (attempt === maxRetries) {
          core.setFailed('ArmorCode request error after maximum retries.');
          return;
        }
        
        // Otherwise wait and retry
        core.info('Waiting 20s before retry...');
        await sleep(20000);
      }
    }
  } catch (error) {
    // Handle any unexpected errors
    if (error instanceof Error) {
      core.setFailed(`Action failed with error: ${error.message}`);
    } else {
      core.setFailed('Action failed with unknown error');
    }
  }
}

/**
 * Sends a POST request to ArmorCode's build validation endpoint
 * with the given parameters, then returns the JSON response.
 */
async function postArmorCodeRequest(
  token: string,
  buildNumber: string,
  jobName: string,
  current: number,
  end: number,
  apiUrl: string,
  jobUrl: string,
  product: string,
  subProduct: string,
  env: string,
  additionalAQLFilters: string
): Promise<any> {
  const url = `${apiUrl}/client/build`;
  
  // Create payload
  const payload = {
    env,
    product,
    subProduct,
    buildNumber,
    jobName,
    current: current.toString(),
    end: end.toString(),
    jobURL: jobUrl,
    additionalAQLFilters: additionalAQLFilters || ''
  };
  
  core.debug(`POST URL: ${url}`);
  core.debug(`Payload: ${JSON.stringify(payload)}`);
  
  // Make the request
  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept-Charset': 'UTF-8'
    }
  });
  
  return response.data;
}

/**
 * Creates a detailed error message with links and context information
 * Handles both severity-based and risk-based release gates
 */
function formatDetailedErrorMessage(
  responseJson: any,
  product: string,
  subProduct: string,
  env: string,
  buildNumber: string,
  jobName: string,
  jobUrl: string
): string {
  let message = '';
  message += `Group: ${product}\n`;
  message += `Sub Group: ${subProduct}\n`;
  message += `Environment: ${env}\n`;
  
  // Extract findings scope based on the release gate type
  let findingsScope = '';
  let hasFindings = false;
  
  // Process severity findings
  if (responseJson.severity) {
    const severity = responseJson.severity;
    
    if (severity.Critical && severity.Critical > 0) {
      findingsScope += `${severity.Critical} Critical, `;
      hasFindings = true;
    }
    if (severity.High && severity.High > 0) {
      findingsScope += `${severity.High} High, `;
      hasFindings = true;
    }
    if (severity.Medium && severity.Medium > 0) {
      findingsScope += `${severity.Medium} Medium, `;
      hasFindings = true;
    }
    if (severity.Low && severity.Low > 0) {
      findingsScope += `${severity.Low} Low`;
      hasFindings = true;
    }
  } else if (responseJson['severity.Critical'] || responseJson['severity.High'] || 
             responseJson['severity.Medium'] || responseJson['severity.Low']) {
    // Handle flattened severity format
    if (responseJson['severity.Critical'] && responseJson['severity.Critical'] > 0) {
      findingsScope += `${responseJson['severity.Critical']} Critical, `;
      hasFindings = true;
    }
    if (responseJson['severity.High'] && responseJson['severity.High'] > 0) {
      findingsScope += `${responseJson['severity.High']} High, `;
      hasFindings = true;
    }
    if (responseJson['severity.Medium'] && responseJson['severity.Medium'] > 0) {
      findingsScope += `${responseJson['severity.Medium']} Medium, `;
      hasFindings = true;
    }
    if (responseJson['severity.Low'] && responseJson['severity.Low'] > 0) {
      findingsScope += `${responseJson['severity.Low']} Low`;
      hasFindings = true;
    }
  }
  
  // Process risk findings
  if (responseJson.otherProperties) {
    const riskProperties = responseJson.otherProperties;
    
    if (riskProperties.VERY_POOR && riskProperties.VERY_POOR > 0) {
      findingsScope += `${riskProperties.VERY_POOR} Very Poor, `;
      hasFindings = true;
    }
    if (riskProperties.POOR && riskProperties.POOR > 0) {
      findingsScope += `${riskProperties.POOR} Poor, `;
      hasFindings = true;
    }
    if (riskProperties.FAIR && riskProperties.FAIR > 0) {
      findingsScope += `${riskProperties.FAIR} Fair, `;
      hasFindings = true;
    }
    if (riskProperties.GOOD && riskProperties.GOOD > 0) {
      findingsScope += `${riskProperties.GOOD} Good`;
      hasFindings = true;
    }
  } else if (responseJson['otherProperties.VERY_POOR'] || responseJson['otherProperties.POOR'] ||
             responseJson['otherProperties.FAIR'] || responseJson['otherProperties.GOOD']) {
    // Handle flattened otherProperties format
    if (responseJson['otherProperties.VERY_POOR'] && responseJson['otherProperties.VERY_POOR'] > 0) {
      findingsScope += `${responseJson['otherProperties.VERY_POOR']} Very Poor, `;
      hasFindings = true;
    }
    if (responseJson['otherProperties.POOR'] && responseJson['otherProperties.POOR'] > 0) {
      findingsScope += `${responseJson['otherProperties.POOR']} Poor, `;
      hasFindings = true;
    }
    if (responseJson['otherProperties.FAIR'] && responseJson['otherProperties.FAIR'] > 0) {
      findingsScope += `${responseJson['otherProperties.FAIR']} Fair, `;
      hasFindings = true;
    }
    if (responseJson['otherProperties.GOOD'] && responseJson['otherProperties.GOOD'] > 0) {
      findingsScope += `${responseJson['otherProperties.GOOD']} Good`;
      hasFindings = true;
    }
  }
  
  // Trim trailing comma and space if present
  if (findingsScope.endsWith(', ')) {
    findingsScope = findingsScope.substring(0, findingsScope.length - 2);
  }
  
  if (hasFindings) {
    message += `Findings Scope: ${findingsScope}\n`;
  } else {
    message += 'Findings Scope: No findings detected\n';
  }
  
  // Extract reason from response if available
  let reason = 'SLA check failed'; // Default reason
  if (responseJson.failureReasonText && 
      responseJson.failureReasonText !== null && 
      responseJson.failureReasonText !== '') {
    reason = responseJson.failureReasonText;
  }
  message += `Reason: ${reason}\n`;
  
  // Add details link
  const baseDetailsLink = responseJson.detailsLink || 
                          responseJson.link || 
                          'https://app.armorcode.com/client/integrations/github';
  
  const detailsLink = `${baseDetailsLink}${baseDetailsLink.includes('?') ? '&' : '?'}filters=${encodeURIComponent(
    JSON.stringify({
      buildNumber: [buildNumber],
      jobName: [jobName]
    })
  )}`;
  
  message += `For more details, please refer to: ${detailsLink}`;
  
  return message;
}

/**
 * Sleep function for async/await
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the action
run();
