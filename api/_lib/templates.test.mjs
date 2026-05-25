/**
 * Test suite for api/_lib/templates.js
 *
 * Run with:   node api/_lib/templates.test.mjs
 * Requires:   Node 18+ (uses node:test + node:assert/strict)
 */

import { test } from 'node:test';
import assert  from 'node:assert/strict';
import { createRequire } from 'node:module';

// templates.js uses CommonJS module.exports — bridge via createRequire.
const require = createRequire(import.meta.url);
const { TEMPLATES, SUBJECTS, ALLOWED_VARS, renderTemplate } = require('./templates.js');

// ---------------------------------------------------------------------------
// ALLOWED_VARS
// ---------------------------------------------------------------------------

test('ALLOWED_VARS is a Set', () => {
  assert.ok(ALLOWED_VARS instanceof Set, 'ALLOWED_VARS should be a Set');
  assert.ok(ALLOWED_VARS.size > 0, 'ALLOWED_VARS should not be empty');
});

test('ALLOWED_VARS contains every var named in the Conventions section', () => {
  const expected = [
    'name', 'business', 'trade', 'trade_business',
    'portal_url', 'preview_url', 'live_url', 'current_url',
    'deliver_by', 'ots_hosting', 'ots_domain', 'ots_github',
    'hosting_provider', 'hosting_url', 'client_email',
    'stripe_link', 'revisions_count',
  ];
  for (const v of expected) {
    assert.ok(ALLOWED_VARS.has(v), `ALLOWED_VARS is missing "${v}"`);
  }
});

test('ALLOWED_VARS does not contain the retired {ots_netlify}', () => {
  assert.ok(!ALLOWED_VARS.has('ots_netlify'), '{ots_netlify} is retired — must not appear');
});

// ---------------------------------------------------------------------------
// TEMPLATES / SUBJECTS shape
// ---------------------------------------------------------------------------

test('TEMPLATES is a non-empty plain object', () => {
  assert.ok(typeof TEMPLATES === 'object' && TEMPLATES !== null);
  assert.ok(Object.keys(TEMPLATES).length > 0);
});

test('every TEMPLATES entry has subject, body, and required array', () => {
  for (const [id, tpl] of Object.entries(TEMPLATES)) {
    assert.ok(typeof tpl.subject === 'string',  `${id}.subject must be a string`);
    assert.ok(typeof tpl.body    === 'string',  `${id}.body must be a string`);
    assert.ok(Array.isArray(tpl.required),      `${id}.required must be an array`);
  }
});

test('SUBJECTS is derived correctly from TEMPLATES', () => {
  for (const [id, tpl] of Object.entries(TEMPLATES)) {
    assert.equal(SUBJECTS[id], tpl.subject, `SUBJECTS[${id}] should match TEMPLATES[${id}].subject`);
  }
});

test('all template IDs are present in SUBJECTS', () => {
  const templateIds = Object.keys(TEMPLATES);
  const subjectIds  = Object.keys(SUBJECTS);
  assert.deepEqual(templateIds.sort(), subjectIds.sort());
});

test('every {placeholder} in every template body is in ALLOWED_VARS', () => {
  const re = /\{(\w+)\}/g;
  for (const [id, tpl] of Object.entries(TEMPLATES)) {
    for (const text of [tpl.subject, tpl.body]) {
      let m;
      while ((m = re.exec(text)) !== null) {
        assert.ok(
          ALLOWED_VARS.has(m[1]),
          `Template "${id}" uses unknown var "{${m[1]}}" — add it to ALLOWED_VARS`
        );
      }
    }
  }
});

test('every required var in every template is in ALLOWED_VARS', () => {
  for (const [id, tpl] of Object.entries(TEMPLATES)) {
    for (const v of tpl.required) {
      assert.ok(ALLOWED_VARS.has(v), `${id}.required lists unknown var "${v}"`);
    }
  }
});

test('Post-3-self has the credentials subject (not the default)', () => {
  assert.match(SUBJECTS['Post-3-self'], /credentials to keep safe/);
});

test('all other templates use the standard subject format', () => {
  for (const [id, tpl] of Object.entries(TEMPLATES)) {
    if (id === 'Post-3-self') continue;
    assert.match(tpl.subject, /\{business\} — your NeoBookworm website/,
      `${id} should use the standard subject`);
  }
});

// ---------------------------------------------------------------------------
// J1-E1 — verbatim content checks
// ---------------------------------------------------------------------------

test('J1-E1 renders correct subject', () => {
  const { subject } = renderTemplate('J1-E1', {
    name:       'Tom',
    business:   'Hart Plumbing',
    deliver_by: 'Tuesday 4 June',
    portal_url: 'https://neobookworm.uk/c/hart-plumbing-3f9k2/',
  });
  assert.equal(subject, 'Hart Plumbing — your NeoBookworm website');
});

test('J1-E1 body opens with correct greeting', () => {
  const { body } = renderTemplate('J1-E1', {
    name:       'Tom',
    business:   'Hart Plumbing',
    deliver_by: 'Tuesday 4 June',
    portal_url: 'https://neobookworm.uk/c/hart-plumbing-3f9k2/',
  });
  assert.ok(body.startsWith('Hi Tom,'), 'body should start with "Hi Tom,"');
});

test('J1-E1 body contains all interpolated values', () => {
  const vars = {
    name:       'Tom',
    business:   'Hart Plumbing',
    deliver_by: 'Tuesday 4 June',
    portal_url: 'https://neobookworm.uk/c/hart-plumbing-3f9k2/',
  };
  const { body } = renderTemplate('J1-E1', vars);

  assert.ok(body.includes('Hart Plumbing'), 'business name not found in body');
  assert.ok(body.includes('Tuesday 4 June'), 'deliver_by not found in body');
  assert.ok(body.includes('https://neobookworm.uk/c/hart-plumbing-3f9k2/'), 'portal_url not found in body');
});

test('J1-E1 body ends with correct sign-off', () => {
  const { body } = renderTemplate('J1-E1', {
    name:       'Tom',
    business:   'Hart Plumbing',
    deliver_by: 'Tuesday 4 June',
    portal_url: 'https://neobookworm.uk/c/hart-plumbing-3f9k2/',
  });
  assert.ok(body.includes('Nick — NeoBookworm.uk'), 'sign-off line 1 missing');
  assert.ok(body.includes('nick@neobookworm.uk'),   'sign-off line 2 missing');
  assert.ok(body.endsWith('nick@neobookworm.uk'),   'body should end with sign-off');
});

test('J1-E1 body contains the "7 days" spirit (publicly out there)', () => {
  const { body } = renderTemplate('J1-E1', {
    name: 'Tom', business: 'Hart Plumbing',
    deliver_by: 'Tuesday 4 June',
    portal_url: 'https://neobookworm.uk/c/test/',
  });
  assert.ok(
    body.includes("what's publicly out there about"),
    'verbatim phrase "what\'s publicly out there about" missing'
  );
  assert.ok(
    body.includes('Checkatrade or Yell'),
    'verbatim phrase "Checkatrade or Yell" missing'
  );
  assert.ok(
    body.includes('Bookmark it on your phone'),
    'verbatim phrase "Bookmark it on your phone" missing'
  );
});

test('J1-E1 body contains no unresolved {placeholder} tokens', () => {
  const { body } = renderTemplate('J1-E1', {
    name: 'Sarah', business: 'Brooks Decorating',
    deliver_by: 'Wednesday 10 June',
    portal_url: 'https://neobookworm.uk/c/brooks-dec-7x2q/',
  });
  assert.doesNotMatch(body, /\{[a-z_]+\}/, 'unresolved {placeholder} found in rendered body');
});

// ---------------------------------------------------------------------------
// Post-3-self — credentials email
// ---------------------------------------------------------------------------

test('Post-3-self renders with correct subject', () => {
  const { subject } = renderTemplate('Post-3-self', {
    name: 'Jane', business: 'Green Acre Landscapes',
    hosting_provider: 'Netlify', hosting_url: 'app.netlify.com',
    client_email: 'jane@greenacre.co.uk',
    ots_hosting: 'https://onetimesecret.com/secret/abc',
    ots_domain:  'https://onetimesecret.com/secret/def',
    ots_github:  'https://onetimesecret.com/secret/ghi',
    portal_url:  'https://neobookworm.uk/c/green-acre-4ab2/',
  });
  assert.equal(subject, 'Green Acre Landscapes — credentials to keep safe');
});

test('Post-3-self uses {ots_hosting} not {ots_netlify}', () => {
  // The body must contain ots_hosting content and must NOT reference ots_netlify.
  assert.ok(!TEMPLATES['Post-3-self'].body.includes('{ots_netlify}'),
    '{ots_netlify} (retired name) must not appear in Post-3-self body');
  assert.ok(TEMPLATES['Post-3-self'].body.includes('{ots_hosting}'),
    '{ots_hosting} must appear in Post-3-self body');
});

// ---------------------------------------------------------------------------
// Error cases — strict allowlist
// ---------------------------------------------------------------------------

test('unknown template ID throws', () => {
  assert.throws(
    () => renderTemplate('DOES-NOT-EXIST', {}),
    (err) => {
      assert.match(err.message, /Unknown template id/);
      return true;
    }
  );
});

test('unknown variable key in vars throws', () => {
  assert.throws(
    () => renderTemplate('J1-E1', {
      name: 'Tom', business: 'Hart Plumbing',
      deliver_by: 'Tuesday 4 June', portal_url: 'https://x/',
      not_a_real_var: 'bad',
    }),
    (err) => {
      assert.match(err.message, /Unknown variable/);
      return true;
    }
  );
});

test('missing required variable throws', () => {
  assert.throws(
    () => renderTemplate('J1-E1', {
      name: 'Tom', business: 'Hart Plumbing', deliver_by: 'Tuesday 4 June',
      // portal_url intentionally omitted
    }),
    (err) => {
      assert.match(err.message, /Missing required variable/);
      assert.match(err.message, /portal_url/);
      return true;
    }
  );
});

test('empty string for required var throws', () => {
  assert.throws(
    () => renderTemplate('J1-E1', {
      name: 'Tom', business: 'Hart Plumbing',
      deliver_by: 'Tuesday 4 June', portal_url: '',
    }),
    (err) => {
      assert.match(err.message, /Missing required variable/);
      return true;
    }
  );
});

test('null for required var throws', () => {
  assert.throws(
    () => renderTemplate('J1-E1', {
      name: 'Tom', business: 'Hart Plumbing',
      deliver_by: null, portal_url: 'https://x/',
    }),
    (err) => {
      assert.match(err.message, /Missing required variable/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// Stub templates
// ---------------------------------------------------------------------------

test('stub templates are registered and have stub:true', () => {
  const stubs = ['J1-E2', 'J2-E2', 'J2-Branch-A', 'J3-E2', 'J4-E2', 'C3', 'C5'];
  for (const id of stubs) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(TEMPLATES, id),
      `Stub template "${id}" not found in TEMPLATES`
    );
    assert.equal(TEMPLATES[id].stub, true, `${id} should have stub:true`);
  }
});

test('stub template J1-E2 renders without throwing when required vars supplied', () => {
  const { subject, body } = renderTemplate('J1-E2', { name: 'Tom', business: 'Hart Plumbing' });
  assert.equal(subject, 'Hart Plumbing — your NeoBookworm website');
  assert.ok(body.includes('STUB'), 'stub body should contain STUB marker');
  assert.ok(body.includes('J1-E2'), 'stub body should contain the template ID');
});

// ---------------------------------------------------------------------------
// Catalogue completeness — all expected IDs are registered
// ---------------------------------------------------------------------------

test('all expected journey + convergence + post-launch + ongoing IDs are registered', () => {
  const expected = [
    // J1
    'J1-E1', 'J1-E2', 'J1-E3', 'J1-E4',
    // J2
    'J2-E1', 'J2-E2', 'J2-Branch-A', 'J2-Branch-B',
    // J3
    'J3-E1', 'J3-E2', 'J3-E3', 'J3-E4',
    // J4
    'J4-E1', 'J4-E2', 'J4-E3', 'J4-E4',
    // J5
    'J5-E1-quick', 'J5-E1-booking',
    // Convergence
    'C1', 'C2', 'C3', 'C4', 'C5',
    // Post-launch
    'Post-1', 'Post-2', 'Post-3-care', 'Post-3-self',
    'Post-4', 'Post-5', 'Post-6',
    // Ongoing
    'Ongoing-1', 'Ongoing-2-care', 'Ongoing-2-self', 'Ongoing-3',
  ];
  for (const id of expected) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(TEMPLATES, id),
      `Template "${id}" is missing from TEMPLATES`
    );
  }
});
