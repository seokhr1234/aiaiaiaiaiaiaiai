import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const htmlName = '동행길-시연.html';
const htmlPath = path.join(rootDir, htmlName);
// 4173은 기존 donghaeng-nav 시연 서버가 사용 중이므로, 현재 HTML은 4174로 엽니다.
const port = Number(process.env.PORT || 4174);

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end('Method not allowed');
  }
  if (!['/', '/' + htmlName].includes(pathname)) {
    response.writeHead(404);
    return response.end('Not found');
  }
  try {
    const html = await readFile(htmlPath);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : html);
  } catch {
    response.writeHead(500);
    response.end('Unable to read demo file');
  }
});

server.once('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.log('동행길 시연 서버가 이미 실행 중입니다: http://127.0.0.1:' + port);
    return;
  }
  throw error;
});

server.listen(port, '127.0.0.1', () => {
  console.log('동행길 시연: http://127.0.0.1:' + port);
});
