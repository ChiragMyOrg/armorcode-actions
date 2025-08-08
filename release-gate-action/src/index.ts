import * as core from '@actions/core'
import { run } from './runner'

// Run the action and handle any uncaught errors
try {
  run()
} catch (error) {
  if (error instanceof Error) {
    core.setFailed(`Action failed with error: ${error.message}`)
  } else {
    core.setFailed('Action failed with unknown error')
  }
}
