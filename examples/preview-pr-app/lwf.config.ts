import { defineConfig } from 'lwf';

// Function name and IAM role automatically get -${subdomain} suffix when deployed with --subdomain
export default defineConfig({
  Regions: ['ap-northeast-1'],
  Lambda: {
    FunctionName: 'my-web-app',
    Runtime: 'nodejs24.x',
    Architectures: ['arm64'],
    MemorySize: 512,
    Timeout: 30,
    Environment: {
      Variables: {
        NODE_ENV: 'production',
        SUBDOMAIN: '${SUBDOMAIN}',
      },
    },
  },
  // CloudFront Subdomain Routing (Preview / Tenant Environments)
  // Allows accessing preview via https://${subdomain}.preview.example.com
  CloudFront: {
    DistributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT',
    OAC: true,
    SubdomainRouting: {
      Domain: 'preview.example.com',
    },
  },
});
