// `GET /` is both the API's health check and the landing page. Browsers ask
// for HTML, so they get the page. API clients and agents (curl, fetch, MCP
// clients) don't, so they keep getting the JSON health check.
export function wantsLandingPage(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false
  }

  if (new URL(request.url).pathname !== '/') {
    return false
  }

  const accept = request.headers.get('accept') ?? ''

  return accept.includes('text/html')
}
