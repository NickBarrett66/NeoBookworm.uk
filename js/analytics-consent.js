// Load Google Analytics only after the visitor accepts analytics cookies.
const GA_ID = 'G-FM1VG68GKQ';

let loadPromise = null;

function ensureGtagStub() {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
}

export function loadGoogleAnalytics() {
  if (window.__nbGaLoaded) {
    return Promise.resolve();
  }
  if (loadPromise) {
    return loadPromise;
  }

  ensureGtagStub();
  window.gtag('consent', 'default', { analytics_storage: 'denied' });

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    script.onload = () => {
      window.__nbGaLoaded = true;
      window.gtag('js', new Date());
      window.gtag('config', GA_ID);
      resolve();
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Analytics'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function grantAnalyticsConsent() {
  return loadGoogleAnalytics().then(() => {
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
  });
}

export function denyAnalyticsConsent() {
  ensureGtagStub();
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', { analytics_storage: 'denied' });
  }
}
