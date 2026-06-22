// Email template module — NeoBookworm onboarding.
//
// Single source of truth for every transactional email sent during onboarding.
// Enforces:
//   - Subject-threading convention: identical subject per relationship lifetime
//   - Strict variable allowlist: unknown var → throw
//   - Required variable enforcement: missing required var → throw
//   - Unknown template ID → throw
//
// Usage:
//   const { renderTemplate } = require('./_lib/templates');
//   const { subject, body } = renderTemplate('J1-E1', { name, business, deliver_by, portal_url });
//
// Sessions:
//   S2 — J1-E1 implemented verbatim; all other IDs stubbed (body added per session).

'use strict';

// ---------------------------------------------------------------------------
// ALLOWED_VARS
// All valid placeholder names across every template. Any {placeholder} found
// in a body or any key supplied by the caller must appear in this set or the
// call throws. Extend here when a new variable is introduced in a template.
// ---------------------------------------------------------------------------

const ALLOWED_VARS = new Set([
  // Core identity
  'name',
  'business',
  'trade',
  'trade_business',

  // URLs
  'portal_url',
  'preview_url',
  'live_url',
  'current_url',

  // Dates / scheduling
  'deliver_by',
  'deliver_by_switch',
  'go_live_date',
  'renewal_date',
  'date',

  // Domain
  'domain',
  'suggested_domain',

  // Hosting (stored per client in D1 — not hardcoded to Netlify)
  'hosting_provider',
  'hosting_url',
  'client_email',

  // OneTimeSecret credential links (self-managed handover only)
  'ots_hosting',
  'ots_domain',
  'ots_github',

  // Payment / ongoing
  'stripe_link',
  'revisions_count',
  'google_review_url',
]);

// ---------------------------------------------------------------------------
// Subject helpers
// ---------------------------------------------------------------------------

const DEFAULT_SUBJECT = `{business} — NeoBookworm.uk — Websites, done properly`;
const CREDENTIALS_SUBJECT = '{business} — credentials to keep safe';

// Sign-off appended to every body (one blank line above, per Conventions).
const SIGN_OFF = '\nRegards\n\nNick\n\nnick@neobookworm.uk\nwebsites, done properly';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return a stub template definition. Registered so the ID is recognised, but
 * body is a clear placeholder until the session that implements it lands.
 * Callers can detect stubs via `TEMPLATES[id].stub === true`.
 */
function _stub(id, required = ['name', 'business']) {
  return {
    subject: DEFAULT_SUBJECT,
    body: `[STUB: ${id} — template body not yet implemented]`,
    required,
    stub: true,
  };
}

// ---------------------------------------------------------------------------
// TEMPLATES
// ---------------------------------------------------------------------------
// Each entry: { subject, body, required, stub? }
//   subject  — may contain {business}; will be interpolated
//   body     — plain-text body with {var} placeholders; sign-off is included
//   required — array of var names that must be supplied; throw if absent
//   stub     — true when body is a placeholder (set by _stub())
// ---------------------------------------------------------------------------

const TEMPLATES = {

  // ── J1 — Free preview ────────────────────────────────────────────────────

  'J1-E1': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Got it — thanks for filling that in. Here's what I'm doing next:",
      '',
      "I'll spend the next few days looking at what's publicly out there about {business} — your Google profile, anything on Checkatrade or Yell, your Facebook page if you have one, the kind of work you're known for. Then I'll build you a first version from what I find.",
      '',
      "You'll have a link to view it by {deliver_by}.",
      '',
      "I've also set up a page just for you where you can track where things are, send me photos, or message me without digging through your inbox:",
      '',
      '{portal_url}',
      '',
      "Bookmark it on your phone — it's the easiest way to stay in the loop.",
      '',
      'If anything urgent comes up before then, just reply to this email.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'deliver_by', 'portal_url'],
  },

  'J1-E2': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Quick note from me while your site's in progress.",
      '',
      "I've had a look at what's publicly out there about {business} — Google, Checkatrade, Facebook — and I've got a clear picture of what you do and where you work. Build's underway.",
      '',
      "If there's anything you'd like me to know that doesn't show up online — specific jobs you want more of, towns you cover that I might not have found, anything about how you work that makes you different — now's the good time to say. Just reply to this.",
      '',
      "Otherwise, I'll have something for you to look at soon.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business'],
  },

  'J1-E3': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Quick update — I'm about halfway through your site. Build's going well. Still on track for {deliver_by}.",
      '',
      "If you've got any work photos you want me to use, drop them on your portal: {portal_url}",
      '',
      'Otherwise, no action needed.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'deliver_by', 'portal_url'],
    stub: false,
  },

  'J1-E4': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Your site's ready to look at:",
      '',
      '{preview_url}',
      '',
      'A few things to know:',
      '',
      "- Open it on your phone first. That's where 70% of your visitors will see it, so it's the view that matters most.",
      "- This is the first version. It's a starting point, not the finished article. Tell me what's wrong and I'll fix it.",
      "- Take your time. No deadline. I'll leave it up for at least a month.",
      '',
      "When you're ready, your portal has buttons for each of the three things you might want to do:",
      '',
      '{portal_url}',
      '',
      '  → "Love it, let\'s go live"',
      '  → "A few changes please" (with a form to tell me what)',
      '  → "Not for me, thanks" (no awkward conversation)',
      '',
      "Have a look when you've got ten minutes.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'preview_url', 'portal_url'],
  },

  // ── J2 — Free site review ─────────────────────────────────────────────────

  'J2-E1': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Got it — you'd like me to take a look at {current_url} and tell you honestly what I think.",
      '',
      "I'll have the review back to you by {deliver_by}. It'll cover:",
      '',
      "- What's working",
      "- What I'd change if it were mine",
      '- One or two specific fixes that would make a real difference',
      "- An honest call on whether it's worth rebuilding or just tweaking",
      '',
      "No sales pitch. If your site's fine as it is, I'll tell you that.",
      '',
      "I've also set up a page for you so you can track this and anything that follows: {portal_url}",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'current_url', 'deliver_by', 'portal_url'],
  },

  'J2-E2': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Your site review is ready. It's on your portal:",
      '',
      '{portal_url}',
      '',
      "I've gone through {business}'s current site properly — what's working, what isn't, what I'd change if it were mine, and whether it's worth rebuilding or just tweaking.",
      '',
      "No sales pitch in there. If the site's fine as it is, I've said so.",
      '',
      "Have a read and let me know what you think. Three options are on the portal — carry on as you are, go ahead with a new one, or just leave it there. No awkward conversation either way.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'portal_url'],
  },

  'J2-Branch-A': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "You've decided to go ahead with the new site — good.",
      '',
      "I'll build you a replacement from scratch, using what I found in the review as the starting point. You'll have a link to see the first version by {deliver_by_switch}.",
      '',
      'A few things to know:',
      '',
      "- Your current site stays live throughout. Nothing changes for you or your customers until you've seen the new one and said yes.",
      "- The £299.99 covers the build. We'll agree the ongoing arrangement once you've seen it and you're happy.",
      "- If you've got work photos better than the ones on your current site, now's a good time to send them. Just reply with them attached.",
      '',
      "I'll be in touch when it's ready.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'deliver_by_switch'],
  },

  'J2-Branch-B': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "No problem at all. Hope the review's useful — feel free to send it to",
      'your current site person if any of it lands.',
      '',
      "If you ever change your mind, you know where I am. Otherwise, all the",
      'best with {business}.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business'],
  },

  // ── J3 — Ready to switch ──────────────────────────────────────────────────

  'J3-E1': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Got it — you'd like me to build the replacement for {current_url}.",
      '',
      "Here's the plan:",
      '',
      "I'll spend the next couple of days pulling the bits I need from your current site — your services, area, photos, accreditations — then build you a new one from scratch. You'll have a link to view it by {deliver_by}.",
      '',
      "You don't need to do anything in the meantime. If you've got better photos than the ones on your current site, or anything else you want me to use, drop them on your portal:",
      '',
      '{portal_url}',
      '',
      "Important: I won't touch your current site or your domain until you've seen the new one and said yes. Nothing changes for you until you decide it should.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'current_url', 'deliver_by', 'portal_url'],
  },

  'J3-E2': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Quick note while I'm building your replacement.",
      '',
      "I've gone through {current_url} properly — I know what's there, what's missing, and what I'm changing. The new one will cover the same ground but load faster, look better on phones, and be much easier for Google to read.",
      '',
      "If there's anything about the current site you want to keep — a specific wording, a layout choice, anything — let me know now. Otherwise I'll trust my own judgment and you can tell me what to tweak when you've seen the first version.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'current_url'],
  },

  'J3-E3': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Quick update — about halfway through your new site. On track for {deliver_by}.",
      '',
      "If you've got any new work photos you want me to use, drop them on your portal: {portal_url}",
      '',
      'Otherwise, no action needed.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'deliver_by', 'portal_url'],
  },

  'J3-E4': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Your replacement site's ready to look at:",
      '',
      '{preview_url}',
      '',
      'A few things to know:',
      '',
      "- This isn't live yet. Your current site is still up at {current_url} and stays that way until you decide.",
      "- Open the new one on your phone first — that's where most of your visitors will see it.",
      '- Compare them side by side if you want. The PageSpeed score for the new one is in the review section on your portal.',
      '- Take your time. No deadline.',
      '',
      "When you're ready, your portal has three options:",
      '',
      '{portal_url}',
      '',
      '  → "Go ahead — switch me over"',
      '  → "A few changes please"',
      '  → "Stick with what I\'ve got"',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'preview_url', 'current_url', 'portal_url'],
  },

  // ── J4 — Full intake form ─────────────────────────────────────────────────

  'J4-E1': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Thanks for taking the time to fill that in properly — I've got everything I need to make a strong start.",
      '',
      "Here's what's next:",
      '',
      "- I'll review everything you sent and ping you within one working day if I need to clarify anything",
      "- I'll build your site from your brief",
      "- You'll have a link to view it by {deliver_by}",
      '',
      "Your portal — where you can track everything and add anything you forgot to mention — is here:",
      '',
      '{portal_url}',
      '',
      "The more time you put in, the closer I'll get on the first version. You've already put in more than most — good chance we'll need few or no revisions.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'deliver_by', 'portal_url'],
  },

  'J4-E2': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Quick note from me while your site's in progress.",
      '',
      "Your brief was more detailed than most — I've got a good picture of what you want. Build's underway and I'm working from what you sent, not guessing.",
      '',
      "If anything changed since you filled the form in, or you've got new work photos you want me to use, just reply. Otherwise I'll have something for you to look at soon.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business'],
  },

  'J4-E3': {
    subject: DEFAULT_SUBJECT,
    // Identical to J1-E3 per playbook ("Identical to J1-E3")
    body: [
      'Hi {name},',
      '',
      "Quick update — I'm about halfway through your site. Build's going well. Still on track for {deliver_by}.",
      '',
      "If you've got any work photos you want me to use, drop them on your portal: {portal_url}",
      '',
      'Otherwise, no action needed.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'deliver_by', 'portal_url'],
  },

  'J4-E4': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Your site's ready to look at:",
      '',
      '{preview_url}',
      '',
      "Because you gave me a proper brief, I've built this close to what I think you'll want. That said, the first version is always a starting point — if anything's not right, just tell me and I'll fix it.",
      '',
      'A few things to know:',
      '',
      "- Open it on your phone first. That's where 70% of your visitors will see it, so it's the view that matters most.",
      "- Take your time. No deadline. I'll leave it up for at least a month.",
      '',
      "When you're ready, your portal has buttons for each of the three things you might want to do:",
      '',
      '{portal_url}',
      '',
      '  → "Love it, let\'s go live"',
      '  → "A few changes please" (with a form to tell me what)',
      '  → "Not for me, thanks" (no awkward conversation)',
      '',
      "Have a look when you've got ten minutes.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'preview_url', 'portal_url'],
  },

  // ── J5 — Discovery ────────────────────────────────────────────────────────

  'J5-E1-quick': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      'Got your message — thanks.',
      '',
      "I'll come back to you personally within one working day.",
      '',
      "While you're here, your prospect page is at {portal_url} — bookmark",
      'it on your phone. Anything we agree, anything you send me, anything',
      "that's owed back to you, all lives there.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'portal_url'],
  },

  'J5-E1-booking': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      'Looking forward to our call on {date}.',
      '',
      "So you don't have to dig out the link, I've put it on your prospect",
      'page: {portal_url}',
      '',
      "Quick question before we talk — what's the one thing about your",
      "business you'd most like the website to do? No long answer needed",
      '— a sentence is fine. I\'ll come to the call having thought about it.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'date', 'portal_url'],
  },

  // ── Convergence ───────────────────────────────────────────────────────────

  'C1': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      'Got your changes — thanks for taking the time to write them out.',
      '',
      "I'll have the updated version back to you by {deliver_by} (usually 2 working days for a round of revisions).",
      '',
      "Your portal's been updated so you can see what stage we're at: {portal_url}",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'deliver_by', 'portal_url'],
  },

  'C2': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      'Round {revisions_count} of changes is done. Have another look:',
      '',
      '{preview_url}',
      '',
      'Changes I made this round:',
      '- [Specific change 1]',
      '- [Specific change 2]',
      '- [etc.]',
      '',
      "Same three options on your portal whenever you've had a look:",
      '{portal_url}',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'revisions_count', 'preview_url', 'portal_url'],
  },

  'C3': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "You've said the word — let's go.",
      '',
      'To set things in motion, the build fee is £299.99. Pay when you\'re ready:',
      '',
      '{stripe_link}',
      '',
      "Once that's through, I'll get the domain pointed, everything tested on a real phone, and the site live within one to two working days. I'll email you the moment it's up.",
      '',
      "If you'd like to talk through anything before paying — the ongoing plan, the domain, anything else — just reply. No rush.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'stripe_link', 'portal_url'],
  },

  'C4': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      'No problem at all — thanks for taking the time to look.',
      '',
      "If you change your mind, the preview will stay up for another month",
      'at {preview_url}. After that I\'ll take it down.',
      '',
      "If anyone you know is in the market for a website, you know where I am.",
      '',
      'All the best with {business}.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'preview_url'],
  },

  'C5': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      'Payment received — thank you.',
      '',
      "I'll get {business} live within one to two working days. I'll test everything on a real phone before it goes up, then email you the live link the moment it's done.",
      '',
      'Your portal will update when the site is live:',
      '{portal_url}',
      '',
      'Nothing you need to do in the meantime.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'portal_url'],
  },

  // ── Post-launch ───────────────────────────────────────────────────────────

  'Post-1': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      '{business} is live: {live_url}',
      '',
      'Couple of quick things:',
      '',
      "1. I've already tested every page and every form on a phone. All working. If you find anything odd, just reply.",
      '',
      '2. Your handover doc is on your portal: {portal_url}/handover/',
      '',
      "   It explains what's been built, how it gets found on Google, what I'm doing to keep cold callers off your back, and (for the care plan) what's included.",
      '',
      "3. The care plan question. You haven't picked yet, which is fine. The handover doc covers both options:",
      '   - £9.99/month and I look after everything (hosting, security, domain renewal, small changes when you ask)',
      '   - Or take it all over yourself and pay only your domain renewal (£10–15/year)',
      '',
      "   Read the doc, reply with whichever you'd prefer. If you're not sure, I'd suggest starting on the care plan — easy to come off later, harder to come back on.",
      '',
      'Welcome aboard.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'live_url', 'portal_url'],
  },

  'Post-2': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      'Just spent ten minutes testing everything on my own phone — all',
      'forms, all links, all numbers. All good.',
      '',
      'Anything funny in the next few days, drop me a line.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business'],
  },

  'Post-3-care': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      'Care plan it is. Couple of things:',
      '',
      '1. The first £9.99 charge will hit your card on {date}. After that',
      "   it's the same date each month. You can cancel anytime from your",
      "   Stripe customer portal — link's on your prospect page.",
      '',
      "2. You don't need to do anything else. Your domain, your hosting,",
      '   your security, your renewals — all on me.',
      '',
      '3. Small content changes are included. If your phone number changes,',
      '   you want to add a new service, swap out a photo, or tweak some',
      '   wording — just email me and I\'ll usually have it done within a',
      '   couple of working days. Bigger changes (new pages, a different look,',
      "   extra features) are a conversation — I'll quote before touching",
      '   anything.',
      '',
      "You're all set.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'date'],
  },

  'Post-3-self': {
    // New thread — credentials must not get lost in years of history.
    subject: CREDENTIALS_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "You're going self-managed — fair enough. Here are the credentials",
      "you'll need to keep the site running.",
      '',
      'IMPORTANT: each link below can only be opened once, and they all',
      'expire in 7 days. Open each one, copy the password into a password',
      'manager (or write it down somewhere safe), then move on.',
      '',
      "If a link's already been opened by the time you click, it means",
      "either you've used it already or someone else has — let me know and",
      "I'll generate fresh ones.",
      '',
      'Your hosting ({hosting_provider}):',
      '- Email: {client_email}',
      '- Password: {ots_hosting}',
      '- Login at: {hosting_url}',
      '',
      'Your domain (Krystal):',
      '- Email: {client_email}',
      '- Password: {ots_domain}',
      '- Login at: my.krystal.uk',
      '',
      'Your site files (GitHub):',
      '- Email: {client_email}',
      '- Password: {ots_github}',
      '- Login at: github.com',
      '',
      'Your full handover doc — including the annual renewal reminders and',
      "what to do if you need help — is on your portal:",
      '',
      '{portal_url}/handover/',
      '',
      "If you ever change your mind about going self-managed and want me to",
      "take it back on, just email — no awkwardness.",
      SIGN_OFF,
    ].join('\n'),
    required: [
      'name', 'business',
      'hosting_provider', 'hosting_url', 'client_email',
      'ots_hosting', 'ots_domain', 'ots_github',
      'portal_url',
    ],
  },

  'Post-4': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Quick check-in — site's been live a week.",
      '',
      'Three quick questions, only if any of them apply:',
      '',
      '- Anything broken or behaving oddly?',
      "- Anything you'd change now you've lived with it for a few days?",
      '- Got any new work photos worth adding?',
      '',
      "If everything's fine, no need to reply. Just wanted to be sure.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business'],
  },

  'Post-5': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "One thing worth doing now the site's settled in: making sure your Google Business Profile points at it.",
      '',
      "If you've already got a profile, you just need to add the website URL: {live_url}. Takes about 30 seconds.",
      '',
      "If you haven't got one yet, that's where most of your local Google visibility will come from — much more so than the website on its own. There's a step-by-step walkthrough on your portal:",
      '',
      '{portal_url}/google-business/',
      '',
      "Don't put it off — a profile that's been live for six months ranks better than one that's a week old, so the sooner you get it set up, the better.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'live_url', 'portal_url'],
  },

  'Post-6': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "A month in. If the site's been useful, a Google review would mean a",
      "lot to me — it's how other tradespeople find out I exist.",
      '',
      "Here's the link: {google_review_url}",
      '',
      "No pressure. If the site hasn't done what you hoped, tell me that",
      "instead and I'll see what I can fix.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'google_review_url'],
  },

  // ── Care plan ongoing ─────────────────────────────────────────────────────

  'Ongoing-1': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      'Quarterly check-in — quick one.',
      '',
      "Anything you'd like changed on the site? Phone number changed,",
      'services updated, a new photo gallery, a price tweak?',
      '',
      'If nothing, no need to reply.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business'],
  },

  'Ongoing-2-care': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Quick heads-up — your domain renews on {renewal_date}. It's covered",
      "by your care plan, so I'll handle it on the day. No action needed",
      'from you.',
      '',
      "Separate point: if you've recently changed the card that your",
      "£9.99/month care plan charges to, make sure the new one's active",
      "in Stripe — link's on your portal at {portal_url}. Nothing to do",
      "if the card's the same.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'renewal_date', 'portal_url'],
  },

  'Ongoing-2-self': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "Quick heads-up — your domain renews on {renewal_date}. Since you're",
      "on the self-managed plan, you'll need to renew it yourself.",
      '',
      "Krystal will email you the reminder 30 and 7 days out. Check your",
      "junk folder if you don't see it. Cost is usually £10–15.",
      '',
      "If the site goes offline because the domain lapses, it can be",
      "brought back — but it's a hassle. Worth setting a reminder now.",
      '',
      "If you'd like me to take it back over (i.e. move to the care plan",
      "at £9.99/month), just say — no awkwardness, takes 5 minutes.",
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business', 'renewal_date'],
  },

  'Ongoing-3': {
    subject: DEFAULT_SUBJECT,
    body: [
      'Hi {name},',
      '',
      "It's been a year today since {business} went live. Wanted to say",
      'thanks for being one of the first.',
      '',
      "If the site's been working well for you, I'd love a short note",
      "back saying so — keeps me motivated. If it hasn't, tell me what's",
      "not landing and I'll fix it.",
      '',
      'Either way, thanks for the trust.',
      SIGN_OFF,
    ].join('\n'),
    required: ['name', 'business'],
  },
};

// ---------------------------------------------------------------------------
// SUBJECTS — derived map for introspection (e.g. logging, tests)
// ---------------------------------------------------------------------------

const SUBJECTS = Object.fromEntries(
  Object.entries(TEMPLATES).map(([id, t]) => [id, t.subject])
);

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Replace every {placeholder} in `str` with the matching value from `vars`.
 * Throws if a placeholder is encountered but not supplied in `vars`.
 * (Unknown-var validation happens before this in renderTemplate.)
 */
function _interpolate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in vars)) {
      throw new Error(`Variable "{${key}}" appears in template body but was not supplied`);
    }
    return vars[key];
  });
}

// ---------------------------------------------------------------------------
// renderTemplate
// ---------------------------------------------------------------------------

/**
 * Render a template by ID.
 *
 * @param {string} id    - Template ID, e.g. 'J1-E1'
 * @param {object} vars  - Variable values, e.g. { name: 'Tom', business: 'Hart Plumbing', … }
 * @returns {{ subject: string, body: string }}
 * @throws if id is unknown, any var key is not in ALLOWED_VARS, or a required var is missing
 */
function renderTemplate(id, vars) {
  if (!Object.prototype.hasOwnProperty.call(TEMPLATES, id)) {
    throw new Error(`Unknown template id: "${id}"`);
  }

  const tpl = TEMPLATES[id];

  // Reject any var key the caller supplies that isn't in the allowlist.
  for (const key of Object.keys(vars)) {
    if (!ALLOWED_VARS.has(key)) {
      throw new Error(`Unknown variable: "{${key}}" is not in ALLOWED_VARS`);
    }
  }

  // Fast-fail on required vars before doing any string work.
  for (const key of tpl.required) {
    if (vars[key] === undefined || vars[key] === null || vars[key] === '') {
      throw new Error(`Missing required variable: "{${key}}" for template "${id}"`);
    }
  }

  const subject = _interpolate(tpl.subject, vars);
  const body    = _interpolate(tpl.body,    vars);

  return { subject, body };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ALLOWED_VARS,
  TEMPLATES,
  SUBJECTS,
  renderTemplate,
};
