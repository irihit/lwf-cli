import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

app.get('/', (c) => {
  return c.json({
    message: 'Hello from Lambda Web Functions behind Amazon CloudFront!',
    timestamp: new Date().toISOString(),
    cf_ray: c.req.header('cf-ray') || 'direct',
    host: c.req.header('host'),
  });
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
