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
    const armorCodeToken = core.getInput('armorcode_token', { required: true })
    const maxRetries = parseInt(core.getInput('max_retries') || '5', 10)
    const apiUrl = core.getInput('api_url') || 'https://app.armorcode.com'

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
          armorCodeToken,
          buildNumber,
          jobName,
          attempt,
          maxRetries,
          apiUrl,
          jobUrl,
          product,
          subProduct,
          env,
          additionalAQLFilters
        )
        
        const status = response.slaStatus || 'UNKNOWN'
        
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
          core.info(detailedError)
          
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
          core.info('ArmorCode Release Gate Passed')
          return
        }
      } catch (error) {
        if (error instanceof Error) {
          core.error(`ArmorCode request failed: ${error.message}`)
          
          // If we've tried all retries, fail the workflow
          if (attempt === maxRetries) {
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
      core.setFailed(`Action failed with error: ${error.message}`)
    } else {
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
  apiUrl: string,
  jobUrl: string,
  product: string,
  subProduct: string,
  env: string,
  additionalAQLFilters: string
): Promise<ArmorCodeResponse> {
  const url = `${apiUrl}/client/build`
  
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
  let message = 'ArmorCode Release Gate Failed\n'
  
  // Extract reason from response if available
  let reason = 'SLA check failed' // Default reason
  if (responseJson.failureReasonText && 
      responseJson.failureReasonText !== null && 
      responseJson.failureReasonText !== '') {
    reason = responseJson.failureReasonText
  }
  message += `Reason         : ${reason}\n`
  
  // Add product and subproduct information
  message += `Product        : ${product}\n`
  message += `Sub Product    : ${subProduct}\n`
  
  // Add findings scope
  message += `Findings Scope : All findings\n`
  
  // Extract findings counts
  let findingsDetails = ''
  let hasFindings = false
  
  // Process severity findings
  if (responseJson.severity) {
    const severity = responseJson.severity
    
    if (severity.Critical && severity.Critical > 0) {
      findingsDetails += `${severity.Critical} Critical, `
      hasFindings = true
    }
    if (severity.High && severity.High > 0) {
      findingsDetails += `${severity.High} High, `
      hasFindings = true
    }
    if (severity.Medium && severity.Medium > 0) {
      findingsDetails += `${severity.Medium} Medium, `
      hasFindings = true
    }
    if (severity.Low && severity.Low > 0) {
      findingsDetails += `${severity.Low} Low`
      hasFindings = true
    }
  } else if (
    responseJson['severity.Critical'] || 
    responseJson['severity.High'] || 
    responseJson['severity.Medium'] || 
    responseJson['severity.Low']
  ) {
    // Handle flattened severity format
    const criticalCount = responseJson['severity.Critical'] as number
    const highCount = responseJson['severity.High'] as number
    const mediumCount = responseJson['severity.Medium'] as number
    const lowCount = responseJson['severity.Low'] as number
    
    if (criticalCount && criticalCount > 0) {
      findingsDetails += `${criticalCount} Critical, `
      hasFindings = true
    }
    if (highCount && highCount > 0) {
      findingsDetails += `${highCount} High, `
      hasFindings = true
    }
    if (mediumCount && mediumCount > 0) {
      findingsDetails += `${mediumCount} Medium, `
      hasFindings = true
    }
    if (lowCount && lowCount > 0) {
      findingsDetails += `${lowCount} Low`
      hasFindings = true
    }
  }
  
  // Trim trailing comma and space if present
  if (findingsDetails.endsWith(', ')) {
    findingsDetails = findingsDetails.substring(0, findingsDetails.length - 2)
  }
  
  if (hasFindings) {
    message += `Findings       : ${findingsDetails}\n`
  } else {
    message += 'Findings       : No findings detected\n'
  }
  
  // Add details link
  const baseDetailsLink = responseJson.detailsLink || 
                          responseJson.link || 
                          'https://app.armorcode.com/client/integrations/github'
  
  const detailsLink = `${baseDetailsLink}${baseDetailsLink.includes('?') ? '&' : '?'}filters=${encodeURIComponent(
    JSON.stringify({
      buildNumber: [buildNumber],
      jobName: [jobName]
    })
  )}`
  
  message += `View the findings that caused this failure ${detailsLink}`
  
  return message
}

/**
 * Sleep function for async/await
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run the action
run()