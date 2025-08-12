import * as core from '@actions/core'
import * as github from '@actions/github'
import { ArmorCodeResponse, ActionInputs } from './types'
import { postArmorCodeRequest } from './api'
import { formatDetailedErrorMessage } from './formatter'
import { sleep } from './uility'

/**
 * Main function that runs the ArmorCode Release Gate action
 */
export async function run(): Promise<void> {
  try {
    // Get inputs from action
    const inputs: ActionInputs = {
      product: core.getInput('product', { required: true }),
      subProduct: core.getInput('subProduct', { required: true }),
      env: core.getInput('env', { required: true }),
      mode: core.getInput('mode', { required: true }),
      additionalAQLFilters: core.getInput('additionalAQLFilters'),
      armorcodeAPIToken: core.getInput('armorcodeAPIToken', { required: true }),
      maxRetries: parseInt(core.getInput('maxRetries') || '5', 10),
      armorcodeHost: core.getInput('armorcodeHost') || 'https://app.armorcode.com',
      githubToken: core.getInput('githubToken') || process.env.GITHUB_TOKEN || ''
    }

    // Get GitHub context
    const context = github.context
    const buildNumber = context.runNumber.toString()
    const jobName = context.job || ''
    const repoName = context.repo.repo
    const repoOwner = context.repo.owner
    const jobURL = `https://github.com/${repoOwner}/${repoName}/actions/runs/${context.runId}`
    
    // Poll up to maxRetries times
    for (let attempt = 1; attempt <= inputs.maxRetries; attempt++) {
      try {
        // Make the HTTP POST request to ArmorCode
        const response = await postArmorCodeRequest(
          inputs.armorcodeAPIToken,
          buildNumber,
          jobName,
          attempt,
          inputs.maxRetries,
          inputs.armorcodeHost,
          jobURL,
          inputs.product,
          inputs.subProduct,
          inputs.env,
          inputs.additionalAQLFilters
        )
        
        const status = response.status || 'UNKNOWN'
        
        if (status === 'HOLD') {
          // On HOLD => wait 20 seconds, then retry
          await sleep(20000)
        } else if (status === 'FAILED') {
          // SLA failure => provide detailed error with links
          const detailedError = formatDetailedErrorMessage(
            response,
            inputs.product,
            inputs.subProduct,
            inputs.env,
            buildNumber,
            jobName,
            jobURL,
            inputs.githubToken,
            inputs.mode
          )
          
          // Output the formatted error message
          console.log(detailedError)
          
          // Handle failure based on mode
          if (inputs.mode.toLowerCase() === 'block') {
            core.setFailed('ArmorCode Release Gate Failed')
            return
          } else if (inputs.mode.toLowerCase() === 'warn') {
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
          if (attempt === inputs.maxRetries) {
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