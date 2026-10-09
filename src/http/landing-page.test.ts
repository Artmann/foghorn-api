import { describe, expect, it } from 'vitest'

import { wantsLandingPage } from './landing-page'

function request(path: string, accept?: string, method = 'GET') {
  return new Request(`http://localhost${path}`, {
    headers: accept ? { accept } : {},
    method
  })
}

describe('wantsLandingPage', () => {
  it('serves the page to browsers', () => {
    const browserAccept =
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

    expect([
      wantsLandingPage(request('/', browserAccept)),
      wantsLandingPage(request('/', browserAccept, 'HEAD'))
    ]).toEqual([true, true])
  })

  it('keeps the health check for API clients', () => {
    expect([
      wantsLandingPage(request('/')),
      wantsLandingPage(request('/', '*/*')),
      wantsLandingPage(request('/', 'application/json')),
      wantsLandingPage(request('/', 'text/html', 'POST')),
      wantsLandingPage(request('/sites', 'text/html'))
    ]).toEqual([false, false, false, false, false])
  })
})
