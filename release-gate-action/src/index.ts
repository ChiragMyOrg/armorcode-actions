import * as core from '@actions/core'
import * as github from '@actions/github'
import axios from 'axios'

interface ArmorCodeResponse {
  status?: string
  severity?: {
    Critical?: number
    High?: number
    Medium?: number
    Low?: number
  }
  otherProperties?: {
    VERY_POOR?: number
    POOR?: number
    FAIR?: number
    GOOD?: number
  }
  failureReasonText?: string
  detailsLink?: string
  link?: string
  [key: string]: unknown
}

/**
 * Main function that runs the ArmorCode Release Gate action
 */
async function run(): Promise<void> {
  try {
    // Get inputs from action
    const product = core.getInput('product', { required: true })
    const subProduct = core.getInput('subProduct', { required: true })
    const env = core.getInput('env', { required: true })
    const mode = core.getInput('mode', { required: true })
    const additionalAQLFilters = core.getInput('additionalAQLFilters')
    const armorcodeAPIToken = core.getInput('armorcodeAPIToken', { required: true })
    const maxRetries = parseInt(core.getInput('maxRetries') || '5', 10)
    const armorcodeHost = core.getInput('armorcodeHost') || 'https://app.armorcode.com'

    // Get GitHub context
    const context = github.context
    const buildNumber = context.runNumber.toString()
    const jobName = context.job || ''
    const repoName = context.repo.repo
    const repoOwner = context.repo.owner
    const jobUrl = `https://github.com/${repoOwner}/${repoName}/actions/runs/${context.runId}`
    
    // Poll up to maxRetries times
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Make the HTTP POST request to ArmorCode
        const response = await postArmorCodeRequest(
          armorcodeAPIToken,
          buildNumber,
          jobName,
          attempt,
          maxRetries,
          armorcodeHost,
          jobUrl,
          product,
          subProduct,
          env,
          additionalAQLFilters
        )
        
        const status = response.status || 'UNKNOWN'
        
        if (status === 'HOLD') {
          // On HOLD => wait 20 seconds, then retry
          await sleep(20000)
        } else if (status === 'FAILED') {
          // SLA failure => provide detailed error with links
          const detailedError = formatDetailedErrorMessage(
            response,
            product,
            subProduct,
            env,
            buildNumber,
            jobName,
            jobUrl
          )
          
          // Output the formatted error message
          console.log(detailedError)
          
          // Handle failure based on mode
          if (mode.toLowerCase() === 'block') {
            core.setFailed('ArmorCode Release Gate Failed')
            return
          } else if (mode.toLowerCase() === 'warn') {
            core.warning('ArmorCode Release Gate Failed (warning only)')
            break
          }
        } else {
          // SUCCESS or RELEASE or other statuses => pass and break out
          console.log('ArmorCode Release Gate Passed')
          return
        }
      } catch (error) {
        if (error instanceof Error) {
          if (attempt === maxRetries) {
            console.log(`ArmorCode request failed: ${error.message}`)
            core.setFailed('ArmorCode request error after maximum retries.')
            return
          }
          
          // Otherwise wait and retry
          await sleep(20000)
        }
      }
    }
  } catch (error) {
    // Handle any unexpected errors
    if (error instanceof Error) {
      console.log(`Action failed with error: ${error.message}`)
      core.setFailed(`Action failed with error: ${error.message}`)
    } else {
      console.log('Action failed with unknown error')
      core.setFailed('Action failed with unknown error')
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
  armorcodeHost: string,
  jobUrl: string,
  product: string,
  subProduct: string,
  env: string,
  additionalAQLFilters: string
): Promise<ArmorCodeResponse> {
  const url = `${armorcodeHost}/client/build`
  
  // Create base payload
  const payload: Record<string, string> = {
    env,
    product,
    subProduct,
    buildTool: 'GITHUB_ACTIONS',
    buildNumber,
    current: current.toString(),
    end: end.toString()
  }
  
  // Only add additionalAQLFilters if it's provided
  if (additionalAQLFilters && additionalAQLFilters.trim() !== '') {
    payload.additionalAQLFilters = additionalAQLFilters.trim()
  }
  
  // Make the request
  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept-Charset': 'UTF-8'
    }
  })
  
  return response.data as ArmorCodeResponse
}

/**
 * Creates a detailed error message with links and context information
 * Handles both severity-based and risk-based release gates
 * Implementation matches the Jenkins plugin
 */
function formatDetailedErrorMessage(
  responseJson: ArmorCodeResponse,
  product: string,
  subProduct: string,
  env: string,
  buildNumber: string,
  jobName: string,
  jobUrl: string
): string {
  let message = 'ArmorCode Release Gate Failed\n';
  
  message += `Product: ${product}\n`;
  message += `Sub Product: ${subProduct}\n`;
  message += `Environment: ${env}\n`;
  
  // Extract findings scope based on the release gate type
  let findingsScope = '';
  let hasFindings = false;
  let isSeverityBased = false;
  let isRiskBased = false;
  
  // Determine if severity-based by checking if any severity value is > 0
  if (responseJson.severity) {
    const severity = responseJson.severity;
    if ((severity.Critical && severity.Critical > 0) ||
        (severity.High && severity.High > 0) ||
        (severity.Medium && severity.Medium > 0) ||
        (severity.Low && severity.Low > 0)) {
      isSeverityBased = true;
    }
  } else if (
    (responseJson['severity.Critical'] && (responseJson['severity.Critical'] as number) > 0) ||
    (responseJson['severity.High'] && (responseJson['severity.High'] as number) > 0) ||
    (responseJson['severity.Medium'] && (responseJson['severity.Medium'] as number) > 0) ||
    (responseJson['severity.Low'] && (responseJson['severity.Low'] as number) > 0)
  ) {
    isSeverityBased = true;
  }
  
  // Determine if risk-based by checking if any otherProperties value is > 0
  if (responseJson.otherProperties) {
    const riskProperties = responseJson.otherProperties;
    if ((riskProperties.VERY_POOR && riskProperties.VERY_POOR > 0) ||
        (riskProperties.POOR && riskProperties.POOR > 0) ||
        (riskProperties.FAIR && riskProperties.FAIR > 0) ||
        (riskProperties.GOOD && riskProperties.GOOD > 0)) {
      isRiskBased = true;
    }
  } else if (
    (responseJson['otherProperties.VERY_POOR'] && (responseJson['otherProperties.VERY_POOR'] as number) > 0) ||
    (responseJson['otherProperties.POOR'] && (responseJson['otherProperties.POOR'] as number) > 0) ||
    (responseJson['otherProperties.FAIR'] && (responseJson['otherProperties.FAIR'] as number) > 0) ||
    (responseJson['otherProperties.GOOD'] && (responseJson['otherProperties.GOOD'] as number) > 0)
  ) {
    isRiskBased = true;
  }
  
  // Process findings based on the determined type
  if (isSeverityBased) {
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
    } else {
      // Handle flattened severity format
      const criticalCount = responseJson['severity.Critical'] as number;
      const highCount = responseJson['severity.High'] as number;
      const mediumCount = responseJson['severity.Medium'] as number;
      const lowCount = responseJson['severity.Low'] as number;
      
      if (criticalCount && criticalCount > 0) {
        findingsScope += `${criticalCount} Critical, `;
        hasFindings = true;
      }
      if (highCount && highCount > 0) {
        findingsScope += `${highCount} High, `;
        hasFindings = true;
      }
      if (mediumCount && mediumCount > 0) {
        findingsScope += `${mediumCount} Medium, `;
        hasFindings = true;
      }
      if (lowCount && lowCount > 0) {
        findingsScope += `${lowCount} Low`;
        hasFindings = true;
      }
    }
  } else if (isRiskBased) {
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
    } else {
      // Handle flattened otherProperties format
      const veryPoorCount = responseJson['otherProperties.VERY_POOR'] as number;
      const poorCount = responseJson['otherProperties.POOR'] as number;
      const fairCount = responseJson['otherProperties.FAIR'] as number;
      const goodCount = responseJson['otherProperties.GOOD'] as number;
      
      if (veryPoorCount && veryPoorCount > 0) {
        findingsScope += `${veryPoorCount} Very Poor, `;
        hasFindings = true;
      }
      if (poorCount && poorCount > 0) {
        findingsScope += `${poorCount} Poor, `;
        hasFindings = true;
      }
      if (fairCount && fairCount > 0) {
        findingsScope += `${fairCount} Fair, `;
        hasFindings = true;
      }
      if (goodCount && goodCount > 0) {
        findingsScope += `${goodCount} Good`;
        hasFindings = true;
      }
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
  if (responseJson.failureReasonText !== undefined && 
      responseJson.failureReasonText !== null && 
      responseJson.failureReasonText !== '') {
    reason = responseJson.failureReasonText;
  }
  message += `Reason: ${reason}\n`;
  
  // Add details link
  const baseDetailsLink = responseJson.detailsLink || 
                          responseJson.link || 
                          'https://app.armorcode.com/client/integrations/';
  
  const detailsLink = `${baseDetailsLink}${baseDetailsLink.includes('?') ? '&' : '?'}filters=${encodeURIComponent(
    JSON.stringify({
      buildNumber: [buildNumber],
      jobName: [jobName] 
    })
  )}`;
  
  message += `View the findings that caused this failure: ${detailsLink}`;
  
  return message;
}

/**
 * Sleep function for async/await
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run the action
run()