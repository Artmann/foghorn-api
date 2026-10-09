// Cookie consent (vanilla-cookieconsent 3.1.0, in /vendor) with Google Consent
// Mode v2. Google Analytics only loads after a visitor accepts analytics
// cookies. Set `measurementId` to the GA4 measurement ID to turn it on.
const measurementId = ''

window.dataLayer = window.dataLayer || []

function gtag() {
  window.dataLayer.push(arguments)
}

gtag('consent', 'default', {
  ad_personalization: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  analytics_storage: 'denied'
})

let analyticsLoaded = false

function loadAnalytics() {
  if (analyticsLoaded || !measurementId) {
    return
  }

  analyticsLoaded = true

  const script = document.createElement('script')

  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  gtag('js', new Date())
  gtag('config', measurementId)
}

function updateConsent() {
  const analytics = CookieConsent.acceptedCategory('analytics')

  gtag('consent', 'update', {
    analytics_storage: analytics ? 'granted' : 'denied'
  })

  if (analytics) {
    loadAnalytics()
  }
}

CookieConsent.run({
  categories: {
    analytics: {
      autoClear: {
        cookies: [{ name: /^_ga/ }, { name: '_gid' }],
        reloadPage: true
      }
    },
    necessary: {
      enabled: true,
      readOnly: true
    }
  },
  guiOptions: {
    consentModal: {
      equalWeightButtons: true,
      layout: 'box',
      position: 'bottom left'
    },
    preferencesModal: {
      equalWeightButtons: true,
      layout: 'box'
    }
  },
  language: {
    default: 'en',
    translations: {
      en: {
        consentModal: {
          acceptAllBtn: 'Accept',
          acceptNecessaryBtn: 'Reject',
          description:
            'We use Google Analytics to count visits, but only if you say yes. Nothing is tracked until then.',
          showPreferencesBtn: 'Settings',
          title: '$ cookies --ask'
        },
        preferencesModal: {
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Reject all',
          closeIconLabel: 'Close',
          savePreferencesBtn: 'Save settings',
          sections: [
            {
              description:
                'Choose which cookies this site may use. You can change this at any time from the link in the footer.'
            },
            {
              description:
                'Remember your cookie choice. This site does not work as intended without them.',
              linkedCategory: 'necessary',
              title: 'Necessary'
            },
            {
              description:
                'Google Analytics counts visits and shows which sections people read. It sets the _ga cookies.',
              linkedCategory: 'analytics',
              title: 'Analytics'
            }
          ],
          title: 'Cookie settings'
        }
      }
    }
  },
  onChange: updateConsent,
  onConsent: updateConsent
})
