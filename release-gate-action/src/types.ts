export interface ArmorCodeResponse {
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
      productId?: number
      subProductId?: number
    }
    failureReasonText?: string
    detailsLink?: string
    link?: string
    slaStatus?: string
    [key: string]: unknown
  }
  
  export interface ActionInputs {
    product: string
    subProduct: string
    env: string
    mode: string
    additionalAQLFilters: string
    armorcodeAPIToken: string
    maxRetries: number
    armorcodeHost: string
    githubToken: string
  }