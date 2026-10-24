# CloudFront Secured Lambda Web Function

This example connects an existing Amazon CloudFront distribution to an AWS Lambda Web Function via Origin Access Control (OAC).

## Features
- **No CloudFront resource creation**: Connects to your existing distribution ARN.
- **OAC Protection**: Sets Lambda Function URL AuthType to `AWS_IAM` and attaches `lambda:InvokeFunctionUrl` permissions scoped strictly to your distribution's `SourceArn`. Direct access over the public internet is denied.

## Configuration (`lwf.config.ts`)
```ts
import { defineConfig } from 'lwf';

export default defineConfig({
  CloudFront: {
    DistributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT',
    OAC: true,
  },
});
```

## Preview Plan
```bash
lwf plan
```

## Deploy
```bash
lwf apply
```
