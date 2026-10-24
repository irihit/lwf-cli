import { defineConfig } from 'lwf';

export default defineConfig({
  Regions: ['ap-northeast-1'],
  Lambda: {
    FunctionName: 'vanilla-web-function',
    Runtime: 'nodejs24.x',
    Architectures: ['arm64'],
    MemorySize: 256,
    Timeout: 15,
    Environment: {
      Variables: {
        NODE_ENV: 'production',
      },
    },
  },
});
