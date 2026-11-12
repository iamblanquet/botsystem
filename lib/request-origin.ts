// Next's Node server may normalize request.url to localhost behind a proxy.
// Use Host (set by the serving platform) rather than a client-supplied forwarded host.
export function requestOrigin(request: Request) {
  const fallback = new URL(request.url);
  const host = request.headers.get('host');
  const forwardedProtocol = request.headers.get('x-forwarded-proto');
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http' ? forwardedProtocol + ':' : fallback.protocol;
  if (host && /^[a-z\d.:[\]-]+$/i.test(host)) {
    try { return new URL(`${protocol}//${host}`).origin; } catch { /* Use the request URL when Host is malformed. */ }
  }
  return fallback.origin;
}

export function clientAddress(request: Request, vercel = process.env.VERCEL === '1') {
  const address = vercel
    ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim()
    : request.headers.get('cf-connecting-ip');
  return address?.slice(0, 128) || 'local';
}
