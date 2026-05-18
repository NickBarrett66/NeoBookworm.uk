// cookieconsent-config.js
// NeoBookworm.uk — CookieConsent v3 configuration
// Orestbida CookieConsent v3.1.0 (self-hosted in /vendor/cookieconsent/)

import '/vendor/cookieconsent/cookieconsent.umd.js';
import {
  grantAnalyticsConsent,
  denyAnalyticsConsent,
} from '/js/analytics-consent.js';

CookieConsent.run({
  cookie: {
    name: 'nb_cookie_consent',
    expiresAfterDays: 182,
    sameSite: 'Lax',
  },

  guiOptions: {
    consentModal: {
      layout: 'bar',
      position: 'bottom',
      equalWeightButtons: false,
      flipButtons: false,
    },
    preferencesModal: {
      layout: 'box',
      equalWeightButtons: true,
      flipButtons: false,
    },
  },

  categories: {
    necessary: {
      enabled: true,
      readOnly: true,
    },
    analytics: {
      enabled: false,
      autoClear: {
        cookies: [{ name: /^_ga/ }, { name: '_gid' }],
      },
    },
  },

  onConsent: function () {
    if (CookieConsent.acceptedCategory('analytics')) {
      grantAnalyticsConsent();
    }
  },

  onChange: function ({ changedCategories }) {
    if (changedCategories.includes('analytics')) {
      if (CookieConsent.acceptedCategory('analytics')) {
        grantAnalyticsConsent();
      } else {
        denyAnalyticsConsent();
      }
    }
  },

  language: {
    default: 'en',
    translations: {
      en: {
        consentModal: {
          title: 'We use cookies',
          description:
            'We use Google Analytics to understand how visitors use this site — ' +
            'so we can keep improving it. No personal details are collected. ' +
            'You can accept or decline below.',
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Decline',
          showPreferencesBtn: 'Manage preferences',
          footer: '<a href="/privacy.html">Privacy policy</a>',
        },
        preferencesModal: {
          title: 'Cookie preferences',
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Decline all',
          savePreferencesBtn: 'Save preferences',
          closeIconLabel: 'Close',
          sections: [
            {
              title: 'How we use cookies',
              description:
                'Cookies are small text files stored on your device. ' +
                'We only use them for visitor analytics — never for advertising.',
            },
            {
              title: 'Essential cookies',
              description:
                'These cookies are needed for the site to work correctly. ' +
                'They cannot be turned off.',
              linkedCategory: 'necessary',
            },
            {
              title: 'Analytics cookies',
              description:
                'Google Analytics helps us see how many people visit the site ' +
                'and which pages are most useful. All data is anonymous.',
              linkedCategory: 'analytics',
            },
          ],
        },
      },
    },
  },
});

