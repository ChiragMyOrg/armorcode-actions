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
    const groupName = core.getInput('group_name', { required: true })
    const subGroupName = core.getInput('sub_group_name', { required: true })
    const environment = core.getInput('environment', { required: true })
    const mode = core.getInput('mode', { required: true })
    const aql = core.getInput('aql')
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

    // Log all inputs (except token for security)
    core.info('=== ArmorCode Release Gate Action - Input Parameters ===')
    core.info(`Group Name: ${groupName}`)
    core.info(`Sub Group Name: ${subGroupName}`)
    core.info(`Environment: ${environment}`)
    core.info(`Mode: ${mode}`)
    core.info(`AQL: ${aql || '(not provided)'}`)
    core.info(`Max Retries: ${maxRetries}`)
    core.info(`API URL: ${apiUrl}`)
    core.info(`Build Number: ${buildNumber}`)
    core.info(`Job Name: ${jobName}`)
    core.info(`Repository: ${repoOwner}/${repoName}`)
    core.info(`Job URL: ${jobUrl}`)
    core.info('=== Starting ArmorCode Release Gate Check ===')
    
    // Poll up to maxRetries times
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        core.info(`Attempt ${attempt}/${maxRetries}`)
        
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
        )
        
        const status = response.status || 'UNKNOWN'
        core.info('=== ArmorCode Release Gate Response ===')
        core.info(`Status: ${status}`)
        core.info(`Full Response: ${JSON.stringify(response, null, 2)}`)
        
        if (status === 'HOLD') {
          // On HOLD => wait 20 seconds, then retry
          core.info('[INFO] SLA is on HOLD. Sleeping 20s...')
          core.info('[INFO] Sleeping 20 seconds before trying again. You can temporarily release the build from ArmorCode console')
          await sleep(20000)
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
          )
          core.info(detailedError)
          
          // Handle failure based on mode
          if (mode.toLowerCase() === 'block') {
            core.setFailed('[BLOCK] SLA check FAILED => Terminating workflow with failure.')
            return
          } else if (mode.toLowerCase() === 'warn') {
            core.warning('[WARN] SLA check FAILED but "warn" mode is active => Marking as warning and continuing...')
            break
          }
        } else {
          // SUCCESS or RELEASE or other statuses => pass and break out
          core.info('[INFO] ArmorCode check passed! Proceeding...')
          return
        }
      } catch (error) {
        if (error instanceof Error) {
          core.error(`[ERROR] ArmorCode request failed: ${error.message}`)
          // Log additional error details if available
          if (axios.isAxiosError(error) && error.response) {
            core.error(`Response status: ${error.response.status}`)
            core.error(`Response data: ${JSON.stringify(error.response.data)}`)
          }
        } else {
          core.error('[ERROR] ArmorCode request failed with unknown error')
        }
        
        // If we've tried all retries, fail the workflow
        if (attempt === maxRetries) {
          core.setFailed('ArmorCode request error after maximum retries.')
          return
        }
        
        // Otherwise wait and retry
        core.info('Waiting 20s before retry...')
        await sleep(20000)
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
  aql: string
): Promise<ArmorCodeResponse> {
  const url = `${apiUrl}/client/build`
  
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
    aql: aql || ''
  }
  
  // Log request details (without token)
  core.info('=== ArmorCode API Request ===')
  core.info(`URL: ${url}`)
  core.info(`Method: POST`)
  core.info(`Headers: Content-Type: application/json, Authorization: Bearer [REDACTED], Accept-Charset: UTF-8`)
  core.info(`Payload: ${JSON.stringify(payload, null, 2)}`)
  
  // Make the request
  const startTime = Date.now()
  core.info(`Request started at: ${new Date(startTime).toISOString()}`)
  
  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept-Charset': 'UTF-8'
      }
    })
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    // Log response details
    core.info('=== ArmorCode API Response ===')
    core.info(`Status Code: ${response.status}`)
    core.info(`Response Time: ${duration}ms`)
    core.info(`Response Headers: ${JSON.stringify(response.headers, null, 2)}`)
    core.info(`Response Body: ${JSON.stringify(response.data, null, 2)}`)
    
    return response.data as ArmorCodeResponse
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime
    
    core.error('=== ArmorCode API Error ===')
    core.error(`Request Duration Before Error: ${duration}ms`)
    
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        core.error(`Status Code: ${error.response.status}`)
        core.error(`Response Headers: ${JSON.stringify(error.response.headers, null, 2)}`)
        core.error(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`)
      } else if (error.request) {
        // The request was made but no response was received
        core.error('No response received from server')
        core.error(`Request: ${JSON.stringify(error.request)}`)
      } else {
        // Something happened in setting up the request that triggered an Error
        core.error(`Error Message: ${error.message}`)
      }
      core.error(`Error Config: ${JSON.stringify(error.config, null, 2)}`)
    }
    
    throw error
  }
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
  let message = ''
  message += `Group: ${product}\n`
  message += `Sub Group: ${subProduct}\n`
  message += `Environment: ${env}\n`
  
  // Extract findings scope based on the release gate type
  let findingsScope = ''
  let hasFindings = false
  
  // Process severity findings
  if (responseJson.severity) {
    const severity = responseJson.severity
    
    if (severity.Critical && severity.Critical > 0) {
      findingsScope += `${severity.Critical} Critical, `
      hasFindings = true
    }
    if (severity.High && severity.High > 0) {
      findingsScope += `${severity.High} High, `
      hasFindings = true
    }
    if (severity.Medium && severity.Medium > 0) {
      findingsScope += `${severity.Medium} Medium, `
      hasFindings = true
    }
    if (severity.Low && severity.Low > 0) {
      findingsScope += `${severity.Low} Low`
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
      findingsScope += `${criticalCount} Critical, `
      hasFindings = true
    }
    if (highCount && highCount > 0) {
      findingsScope += `${highCount} High, `
      hasFindings = true
    }
    if (mediumCount && mediumCount > 0) {
      findingsScope += `${mediumCount} Medium, `
      hasFindings = true
    }
    if (lowCount && lowCount > 0) {
      findingsScope += `${lowCount} Low`
      hasFindings = true
    }
  }
  
  // Process risk findings
  if (responseJson.otherProperties) {
    const riskProperties = responseJson.otherProperties
    
    if (riskProperties.VERY_POOR && riskProperties.VERY_POOR > 0) {
      findingsScope += `${riskProperties.VERY_POOR} Very Poor, `
      hasFindings = true
    }
    if (riskProperties.POOR && riskProperties.POOR > 0) {
      findingsScope += `${riskProperties.POOR} Poor, `
      hasFindings = true
    }
    if (riskProperties.FAIR && riskProperties.FAIR > 0) {
      findingsScope += `${riskProperties.FAIR} Fair, `
      hasFindings = true
    }
    if (riskProperties.GOOD && riskProperties.GOOD > 0) {
      findingsScope += `${riskProperties.GOOD} Good`
      hasFindings = true
    }
  } else if (
    responseJson['otherProperties.VERY_POOR'] || 
    responseJson['otherProperties.POOR'] ||
    responseJson['otherProperties.FAIR'] || 
    responseJson['otherProperties.GOOD']
  ) {
    // Handle flattened otherProperties format
    const veryPoorCount = responseJson['otherProperties.VERY_POOR'] as number
    const poorCount = responseJson['otherProperties.POOR'] as number
    const fairCount = responseJson['otherProperties.FAIR'] as number
    const goodCount = responseJson['otherProperties.GOOD'] as number
    
    if (veryPoorCount && veryPoorCount > 0) {
      findingsScope += `${veryPoorCount} Very Poor, `
      hasFindings = true
    }
    if (poorCount && poorCount > 0) {
      findingsScope += `${poorCount} Poor, `
      hasFindings = true
    }
    if (fairCount && fairCount > 0) {
      findingsScope += `${fairCount} Fair, `
      hasFindings = true
    }
    if (goodCount && goodCount > 0) {
      findingsScope += `${goodCount} Good`
      hasFindings = true
    }
  }
  
  // Trim trailing comma and space if present
  if (findingsScope.endsWith(', ')) {
    findingsScope = findingsScope.substring(0, findingsScope.length - 2)
  }
  
  if (hasFindings) {
    message += `Findings Scope: ${findingsScope}\n`
  } else {
    message += 'Findings Scope: No findings detected\n'
  }
  
  // Extract reason from response if available
  let reason = 'SLA check failed' // Default reason
  if (responseJson.failureReasonText && 
      responseJson.failureReasonText !== null && 
      responseJson.failureReasonText !== '') {
    reason = responseJson.failureReasonText
  }
  message += `Reason: ${reason}\n`
  
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
  
  message += `For more details, please refer to: ${detailsLink}`
  
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