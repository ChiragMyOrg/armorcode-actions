# ArmorCode Release Gate Action

This GitHub Action integrates ArmorCode release gates into your GitHub workflows, allowing you to enforce security policies at various stages of your development process, such as during pull requests and before releasing a build.

## Features

- Connects with ArmorCode to trigger release gate evaluations
- Supports two modes:
  - **Block mode**: Stops the GitHub workflow and prints the reason for failure
  - **Warn mode**: Prints a warning if the release gate fails and allows the GitHub workflow to continue
- Provides detailed output with failure reason, group, subgroup, findings scope, and link to findings
- Configurable retry mechanism for checking release gate status


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

## License

MIT
