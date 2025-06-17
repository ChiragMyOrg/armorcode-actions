# ArmorCode Release Gate Action

This GitHub Action integrates ArmorCode release gates into your GitHub workflows, allowing you to enforce security policies at various stages of your development process, such as during pull requests and before releasing a build.

## Features

- Connects with ArmorCode to trigger release gate evaluations
- Supports two modes:
  - **Block mode**: Stops the GitHub workflow and prints the reason for failure
  - **Warn mode**: Prints a warning if the release gate fails and allows the GitHub workflow to continue
- Provides detailed output with failure reason, group, subgroup, findings scope, and link to findings
- Configurable retry mechanism for checking release gate status

## Usage

```yaml
- name: Run ArmorCode Release Gate
  uses: armorcode/actions/release-gate-action@main
  with:
    group_name: 'Demo group'
    sub_group_name: 'WebAppTeam'
    environment: 'production'
    mode: 'block' # or 'warn'
    aql: 'scanType=SAST' # any additional AQL parameters
    armorcode_token: ${{ secrets.ARMORCODE_API_TOKEN }} # Stored securely as a GitHub Secret
```

## Example Workflow

```yaml
name: CI/CD Pipeline

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  release_gate_check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run ArmorCode Release Gate
        id: armorcode_release_gate
        uses: armorcode/actions/release-gate-action@main 
        with:
          group_name: 'Demo group'
          sub_group_name: 'WebAppTeam'
          environment: 'production'
          mode: 'block' # or warn
          aql: 'scanType=SAST' # any additonal AQL parametes
          armorcode_token: ${{ secrets.ARMORCODE_API_TOKEN }} # Stored securely as a GitHub Secret
```

## Example Output

When a release gate fails, you'll see output similar to this:

```
ArmorCode Release Gate Failed
Reason         : 5 critical findings detected. The maximum allowed is 0.
Group          : Demo Group
Sub Group      : Demo Sub Group
Findings Scope : All findings
Findings       : 5 critical, 30 High, 43 Medium, 103 Low
View the findings that caused this failure [link to findings in ArmorCode that caused the failure]
```

## Setting up ArmorCode API Token

1. Log in to your ArmorCode account
2. Navigate to your profile settings
3. Generate an API token with appropriate permissions
4. Add the token as a secret in your GitHub repository:
   - Go to your repository settings
   - Click on "Secrets and variables" > "Actions"
   - Click "New repository secret"
   - Name: `ARMORCODE_API_TOKEN`
   - Value: Your ArmorCode API token
   - Click "Add secret"

## License

MIT
