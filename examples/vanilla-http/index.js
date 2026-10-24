import http from 'node:http';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Hello from AWS Lambda Web Functions!',
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    timestamp: new Date().toISOString(),
    node_version: process.version,
    memory_usage: process.memoryUsage(),
  }, null, 2));
});

// AWS_LAMBDA_HTTP_ENDPOINT is automatically provided by Lambda Web Functions
const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT || '127.0.0.1:3000';
const [host, portStr] = endpoint.split(':');
const port = parseInt(portStr || '3000', 10);

server.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});
