import * as core from "@actions/core";
import { ArmorCodeResponse } from "./types";
import { createSummary } from "./summary";

/**
 * Creates a detailed error message with links and context information
 * Handles both severity-based and risk-based release gates
 */
export function formatDetailedErrorMessage(
  responseJson: ArmorCodeResponse,
  product: string,
  subProduct: string,
  env: string,
  buildNumber: string,
  jobName: string,
  jobUrl: string,
  githubToken: string
): string {
  let message = "ArmorCode Release Gate Failed\n";

  message += `Product: ${product}\n`;
  message += `Sub Product: ${subProduct}\n`;
  message += `Environment: ${env}\n`;

  // Extract findings scope based on the release gate type
  let findingsScope = "";
  let hasFindings = false;
  let isSeverityBased = false;
  let isRiskBased = false;

  // Determine if severity-based by checking if any severity value is > 0
  if (responseJson.severity) {
    const severity = responseJson.severity;
    if (
      (severity.Critical && severity.Critical > 0) ||
      (severity.High && severity.High > 0) ||
      (severity.Medium && severity.Medium > 0) ||
      (severity.Low && severity.Low > 0)
    ) {
      isSeverityBased = true;
    }
  } else if (
    (responseJson["severity.Critical"] &&
      (responseJson["severity.Critical"] as number) > 0) ||
    (responseJson["severity.High"] &&
      (responseJson["severity.High"] as number) > 0) ||
    (responseJson["severity.Medium"] &&
      (responseJson["severity.Medium"] as number) > 0) ||
    (responseJson["severity.Low"] &&
      (responseJson["severity.Low"] as number) > 0)
  ) {
    isSeverityBased = true;
  }

  // Determine if risk-based by checking if any otherProperties value is > 0
  if (responseJson.otherProperties) {
    const riskProperties = responseJson.otherProperties;
    if (
      (riskProperties.VERY_POOR && riskProperties.VERY_POOR > 0) ||
      (riskProperties.POOR && riskProperties.POOR > 0) ||
      (riskProperties.FAIR && riskProperties.FAIR > 0) ||
      (riskProperties.GOOD && riskProperties.GOOD > 0)
    ) {
      isRiskBased = true;
    }
  } else if (
    (responseJson["otherProperties.VERY_POOR"] &&
      (responseJson["otherProperties.VERY_POOR"] as number) > 0) ||
    (responseJson["otherProperties.POOR"] &&
      (responseJson["otherProperties.POOR"] as number) > 0) ||
    (responseJson["otherProperties.FAIR"] &&
      (responseJson["otherProperties.FAIR"] as number) > 0) ||
    (responseJson["otherProperties.GOOD"] &&
      (responseJson["otherProperties.GOOD"] as number) > 0)
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
      const criticalCount = responseJson["severity.Critical"] as number;
      const highCount = responseJson["severity.High"] as number;
      const mediumCount = responseJson["severity.Medium"] as number;
      const lowCount = responseJson["severity.Low"] as number;

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
      const veryPoorCount = responseJson["otherProperties.VERY_POOR"] as number;
      const poorCount = responseJson["otherProperties.POOR"] as number;
      const fairCount = responseJson["otherProperties.FAIR"] as number;
      const goodCount = responseJson["otherProperties.GOOD"] as number;

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
  if (findingsScope.endsWith(", ")) {
    findingsScope = findingsScope.substring(0, findingsScope.length - 2);
  }

  if (hasFindings) {
    message += `Findings Scope: ${findingsScope}\n`;
  } else {
    message += "Findings Scope: No findings detected\n";
  }

  // Extract reason from response if available
  let reason = "SLA check failed"; // Default reason
  if (
    responseJson.failureReasonText !== undefined &&
    responseJson.failureReasonText !== null &&
    responseJson.failureReasonText !== ""
  ) {
    reason = responseJson.failureReasonText;
  }
  message += `Reason: ${reason}\n`;

  // Extract productId and subProductId from otherProperties if they exist
  const productId = responseJson.otherProperties?.productId;
  const subProductId = responseJson.otherProperties?.subProductId;

  // Add details link
  const baseDetailsLink =
    responseJson.detailsLink ||
    responseJson.link ||
    "https://app.armorcode.com/client/integrations/";

  let detailsLink = `${baseDetailsLink}${
    baseDetailsLink.includes("?") ? "&" : "?"
  }filters=${encodeURIComponent(
    JSON.stringify({
      buildNumber: [buildNumber],
      jobName: [jobName],
      product: [productId],
      subproduct: [subProductId]
    })
  )}`;

  message += `View the findings that caused this failure: ${detailsLink}`;

  // Create a summary for GitHub Actions
  createSummary(product, subProduct, env, responseJson, detailsLink, githubToken);

  return message;
}
