import { defineConfig } from 'lwf';

export default defineConfig({
  Regions: ['ap-northeast-1'],
  Lambda: {
    FunctionName: 'cloudfront-secured-app',
    Runtime: 'nodejs24.x',
    Architectures: ['arm64'],
    MemorySize: 512,
    Timeout: 30,
    Environment: {
      Variables: {
        NODE_ENV: 'production',
      },
    },
  },
  // CloudFront Integration:
  // Specify the existing CloudFront Distribution ARN.
  // With OAC: true, lwf configures Function URL AuthType to AWS_IAM and attaches
  // resource-based permissions for cloudfront.amazonaws.com with SourceArn condition.
  CloudFront: {
    DistributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT',
    OAC: true,
  },
});
