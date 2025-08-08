import axios from 'axios'
import { ArmorCodeResponse } from './types'

/**
 * Sends a POST request to ArmorCode's build validation endpoint
 * with the given parameters, then returns the JSON response.
 */
export async function postArmorCodeRequest(
  token: string,
  buildNumber: string,
  jobName: string,
  current: number,
  end: number,
  armorcodeHost: string,
  jobURL: string,
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
    jobName,
    jobURL,
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