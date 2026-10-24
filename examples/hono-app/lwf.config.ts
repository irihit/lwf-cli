import { defineConfig } from 'lwf';

export default defineConfig({
  // Multi-region deployment with latency-based global anycast routing
  Regions: ['ap-northeast-1', 'us-east-1'],
  Lambda: {
    FunctionName: 'hono-web-function',
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
  FunctionUrl: {
    AuthType: 'NONE',
    Cors: {
      AllowOrigins: ['*'],
      AllowMethods: ['GET', 'POST', 'OPTIONS'],
    },
  },
});
