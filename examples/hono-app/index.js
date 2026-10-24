import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

app.get('/', (c) => {
  return c.json({
    message: 'Hello from Multi-Region Lambda Web Functions with Hono!',
    timestamp: new Date().toISOString(),
    region: process.env.AWS_REGION || 'local',
  });
});

app.get('/api/users', (c) => {
  return c.json([
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'developer' },
  ]);
});

app.get('/health', (c) => c.text('OK'));

const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT || '127.0.0.1:3000';
const [host, portStr] = endpoint.split(':');
const port = parseInt(portStr || '3000', 10);

serve({
  fetch: app.fetch,
  port: port,
  hostname: host,
});
