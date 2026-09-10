import type { RequestHandler } from 'express';
export function localApiOnly(port: number): RequestHandler {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  return (request, response, next) => {
    if (!hosts.has(request.headers.host?.toLowerCase() ?? '')) { response.status(403).json({ error: 'Local host required' }); return; }
    const origin = request.headers.origin;
    if (origin && ![...hosts].some(h => origin === `http://${h}`)) { response.status(403).json({ error: 'Cross-origin access denied' }); return; }
    if (request.headers['sec-fetch-site'] === 'cross-site') { response.status(403).json({ error: 'Cross-site access denied' }); return; }
    next();
  };
}
