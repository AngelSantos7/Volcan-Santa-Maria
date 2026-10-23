// Keep in sync with public.is_allowed_push_endpoint and the parity test.
// Provider URLs are opaque: do not rewrite their path or query/token.
export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !endpoint.startsWith('https://')
    || /[^!-~]|[<>"'`{}^|]/u.test(endpoint) || endpoint.includes('\\') || endpoint.includes('#')
    || /%(?![0-9a-f]{2})/iu.test(endpoint) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/iu.test(endpoint)) return false;
  const authority = endpoint.slice(8).split('/')[0];
  // Canonical browser authority only: no IP literals, credentials, explicit port,
  // percent/IDNA escapes, uppercase, trailing dot or empty/invalid DNS labels.
  if (authority.length > 253 || !authority.split('.').every(label =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) return false;
  const permitted = authority === 'fcm.googleapis.com'
    || authority === 'updates.push.services.mozilla.com'
    || authority.endsWith('.push.apple.com')
    || authority.endsWith('.notify.windows.com');
  if (!permitted) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.hostname === authority && url.href === endpoint
      && (url.pathname.length > 1 || url.search.length > 1);
  } catch { return false; }
}
