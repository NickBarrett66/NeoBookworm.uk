/**
 * Validates the incoming landing-enquiry POST body.
 *
 * Required fields: fullName, bizName, email
 * Optional fields: startOption, details, source, currentUrl
 *
 * Returns { ok: true, fields } on success.
 * Returns { ok: false, error: string } on failure.
 */

const VALID_START_OPTIONS = new Set([
  'leave_it_with_me',
  'tell_more',
  'review_site_first',
  'ready_to_switch',
]);

/**
 * @param {unknown} body  Parsed JSON body from the request.
 * @returns {{ ok: true, fields: object } | { ok: false, error: string }}
 */
export function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const { fullName, bizName, email, startOption, details, source, currentUrl } = body;

  if (!fullName || !String(fullName).trim()) {
    return { ok: false, error: 'Name is required.' };
  }
  if (!bizName || !String(bizName).trim()) {
    return { ok: false, error: 'Business name is required.' };
  }
  if (!email || !String(email).trim()) {
    return { ok: false, error: 'Email address is required.' };
  }

  const fields = {
    fullName:    String(fullName).trim(),
    bizName:     String(bizName).trim(),
    email:       String(email).trim().toLowerCase(),
    startOption: startOption && VALID_START_OPTIONS.has(String(startOption).trim())
                   ? String(startOption).trim()
                   : '',
    details:     details    ? String(details).trim()    : '',
    source:      source     ? String(source).trim()     : 'landing',
    currentUrl:  currentUrl ? String(currentUrl).trim() : '',
  };

  return { ok: true, fields };
}
