// DEPRECATED — Phase 4 cutover (14 May 2026)
//
// This endpoint has been superseded by the Cloudflare Worker at:
//   https://api.neobookworm.uk/landing-enquiry
//
// plumbers.html and plumbers-switch.html now POST directly to the Worker.
// See workers/landing-enquiry/README.md for full documentation.
//
// Returns 410 Gone to surface stale-cache hits and confirm the switch is complete.

module.exports = async (req, res) => {
  const referrer = req.headers['referer'] || req.headers['referrer'] || '(none)';
  console.log(
    '[landing-enquiry] 410: received request from referrer:', referrer,
    '— endpoint moved to api.neobookworm.uk/landing-enquiry'
  );

  return res.status(410).json({
    error: 'This endpoint has moved. Use https://api.neobookworm.uk/landing-enquiry',
  });
};
