// NeoBookworm.uk — Cloudflare Worker entry + router.
// Mirrors the booking Worker router style (workers/booking/src/index.js).
// Unmatched paths fall through to env.ASSETS.fetch(request) for static files.

import * as regLookup    from './routes/reg-lookup.js';
import * as bookingAsset from './routes/booking-asset.js';
import * as portal       from './routes/portal.js';
import * as portalAction from './routes/portal-action.js';

// Phase 5:
import * as dashboard    from './routes/dashboard.js';
import * as runSiteAudit from './routes/run-site-audit.js';
import * as intake       from './routes/intake.js';

// Phase 4b — email routes (all send via Gmail API):
import * as contact              from './routes/contact.js';
import * as heTyresEnquiry       from './routes/he-tyres-enquiry.js';
import * as notifyLandingEnquiry from './routes/notify-landing-enquiry.js';
import * as notifyBooking        from './routes/notify-booking.js';

// Matches /c/<slug>[/<section>[/]] where section is one of the known sub-paths.
const C_PATH_RE = /^\/c\/([^/]+)(?:\/(action|guides|review|handover|google-business))?\/?$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p   = url.pathname;

    // ── TyreTrust: serve natively at tyretrust.uk (Worker custom domain) ─────
    // Same files that already serve neobookworm.uk/tyretrust/* — internal
    // links there use absolute paths (/tyretrust/images/..., /fonts.css,
    // /privacy.html) which resolve correctly under either hostname, so only
    // the clean top-level routes need mapping down to the real files.
    if (url.hostname === 'tyretrust.uk' || url.hostname === 'www.tyretrust.uk') {
      // Targets use the assets binding's own clean-URL form (trailing slash
      // for a directory index, no extension for a standalone page) — the
      // literal *.html path works too, but the assets layer then 307s it
      // back to the clean form, and that redirect is host-relative, so it
      // never actually reaches this rewrite.
      const TYRETRUST_ROUTES = {
        '/':            '/tyretrust/',
        '/full':        '/tyretrust/full/',
        '/full/':       '/tyretrust/full/',
        '/proposal':    '/tyretrust/proposal',
        '/proposal/':   '/tyretrust/proposal',
        '/robots.txt':  '/tyretrust/robots.txt',
        '/sitemap.xml': '/tyretrust/sitemap.xml',
      };
      const rewrite = TYRETRUST_ROUTES[p];
      if (rewrite) {
        const assetUrl = new URL(request.url);
        assetUrl.pathname = rewrite;
        return env.ASSETS.fetch(new Request(assetUrl, request));
      }
    }

    // ── Font CORS — booking widget loads fonts cross-origin from this domain ──
    // Browsers enforce CORS on @font-face src URLs; ASSETS binding doesn't add
    // the header automatically, so we intercept and attach it here.
    if (p.startsWith('/fonts/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
      }
      const fontRes = await env.ASSETS.fetch(request);
      const r = new Response(fontRes.body, fontRes);
      r.headers.set('Access-Control-Allow-Origin', '*');
      return r;
    }

    // ── API routes ──────────────────────────────────────────────────────────

    if (p === '/api/reg-lookup')    return regLookup.handle(request, env, ctx, url);
    if (p === '/api/booking-asset') return bookingAsset.handle(request, env, ctx, url);

    // Phase 5:
    if (p === '/api/dashboard')      return dashboard.handle(request, env, ctx, url);
    if (p === '/api/run-site-audit') return runSiteAudit.handle(request, env, ctx, url);
    // Intake aliases (replace vercel.json rewrites):
    if (p === '/api/intake') return intake.handle(request, env, ctx, url);
    if (p === '/api/intake-upload-session') {
      url._aliasAction = 'upload-session';
      return intake.handle(request, env, ctx, url);
    }
    if (p === '/api/intake-finalize') {
      url._aliasAction = 'finalize';
      return intake.handle(request, env, ctx, url);
    }
    if (p === '/api/onboarding-intake') {
      url._aliasAction = 'onboarding';
      return intake.handle(request, env, ctx, url);
    }

    // Phase 4b — email routes:
    if (p === '/api/contact')                return contact.handle(request, env, ctx);
    if (p === '/api/he-tyres-enquiry')       return heTyresEnquiry.handle(request, env, ctx);
    if (p === '/api/notify-landing-enquiry') return notifyLandingEnquiry.handle(request, env, ctx);
    if (p === '/api/notify-booking')         return notifyBooking.handle(request, env, ctx);

    // ── Portal routes (/c/:slug[/<section>]) ─────────────────────────────────

    const cMatch = C_PATH_RE.exec(p);
    if (cMatch) {
      const subPath = cMatch[2] || '';
      if (subPath === 'action') return portalAction.handle(request, env, ctx, url);
      return portal.handle(request, env, ctx, url);
    }

    // ── Static assets fall-through ───────────────────────────────────────────
    const assetRes = await env.ASSETS.fetch(request);
    // Chrome's scroll-to-text-fragment (#:~:text=...) auto-scrolls the page to
    // whatever phrase a link happens to encode (e.g. from a Google search result
    // snippet), with no interaction — this header disables it site-wide so pages
    // always open at the top.
    if ((assetRes.headers.get('content-type') || '').includes('text/html')) {
      const r = new Response(assetRes.body, assetRes);
      r.headers.set('Document-Policy', 'force-load-at-top');
      return r;
    }
    return assetRes;
  },
};
