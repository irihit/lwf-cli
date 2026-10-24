# Preview & Dynamic Tenant Deployment with CloudFront Subdomain Routing

This example demonstrates deploying on-demand preview or tenant environments to AWS Lambda Web Functions and automatically routing traffic via subdomains like `https://42.preview.example.com` or `https://feat-login.preview.example.com`.

## How it works

1. You have a wildcard CloudFront distribution (e.g. `*.preview.example.com`).
2. When deploying a feature branch or PR preview, run:
   ```bash
   npx lwf apply --subdomain 42
   # or with string subdomain / short flag:
   npx lwf apply -s feat-login
   ```
3. `lwf`:
   - Deploys the Lambda Web Function named `my-web-app-42`.
   - Protects the function using CloudFront OAC.
   - Registers a new Origin `lwf-origin-my-web-app-42` in your existing CloudFront distribution.
   - Sets up or updates the edge routing function so traffic to `42.preview.example.com` automatically routes to this environment!
4. When deleting the preview environment:
   ```bash
   npx lwf destroy --subdomain 42 --yes
   ```
   This deletes the Lambda function and safely unregisters the Origin from CloudFront.

---

## Testing locally with dry-run

```bash
lwf plan --subdomain 42
lwf apply --subdomain 42 --dry-run
```

---

## GitHub Actions Workflow Example

```yaml
name: Preview Deployment

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

jobs:
  preview:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy-role
          aws-region: ap-northeast-1

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Deploy Preview
        if: github.event.action != 'closed'
        run: |
          npm install
          npx lwf apply --subdomain ${{ github.event.pull_request.number }}

      - name: Destroy Preview
        if: github.event.action == 'closed'
        run: |
          npx lwf destroy --subdomain ${{ github.event.pull_request.number }} --yes
```
