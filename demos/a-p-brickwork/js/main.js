/* ============================================================
   A P Brickwork — main.js
   Mobile nav · Demo intercepts (tel: + form submit)
   Vanilla JS, no frameworks.
============================================================ */

(function () {
  'use strict';

  /* ── MOBILE NAV ─────────────────────────────────────── */
  var navOverlay = document.querySelector('[data-nav-overlay]');
  var navToggle  = document.querySelector('[data-nav-open]');
  var navClose   = document.querySelector('[data-nav-close]');

  function openNav() {
    if (!navOverlay) return;
    navOverlay.setAttribute('data-open', 'true');
    navOverlay.setAttribute('aria-hidden', 'false');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    var firstLink = navOverlay.querySelector('a, button');
    if (firstLink) firstLink.focus();
  }

  function closeNav() {
    if (!navOverlay) return;
    navOverlay.setAttribute('data-open', 'false');
    navOverlay.setAttribute('aria-hidden', 'true');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (navToggle) navToggle.focus();
  }

  if (navToggle) navToggle.addEventListener('click', openNav);
  if (navClose)  navClose.addEventListener('click', closeNav);

  if (navOverlay) {
    navOverlay.addEventListener('click', function (e) {
      if (e.target === navOverlay) closeNav();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navOverlay && navOverlay.getAttribute('data-open') === 'true') {
      closeNav();
    }
  });

  /* ── DEMO MODAL ─────────────────────────────────────── */
  var demoModal    = document.getElementById('demo-modal');
  var demoBackdrop = document.getElementById('demo-modal-backdrop');
  var demoClose    = document.getElementById('demo-modal-close');

  function openDemoModal() {
    if (!demoBackdrop) return;
    demoBackdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (demoClose) demoClose.focus();
  }

  function closeDemoModal() {
    if (!demoBackdrop) return;
    demoBackdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  if (demoClose) demoClose.addEventListener('click', closeDemoModal);

  if (demoBackdrop) {
    demoBackdrop.addEventListener('click', function (e) {
      if (e.target === demoBackdrop) closeDemoModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && demoBackdrop.classList.contains('is-open')) {
        closeDemoModal();
      }
    });
  }

  /* ── DEMO BLOCK: tel: links ─────────────────────────── */
  document.querySelectorAll('a[data-demo-block]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      openDemoModal();
    });
  });

  /* ── DEMO BLOCK: contact form ───────────────────────── */
  var contactForm    = document.getElementById('contact-form');
  var formSuccess    = document.getElementById('form-success');

  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var isValid = contactForm.checkValidity();
      if (!isValid) {
        contactForm.reportValidity();
        return;
      }
      contactForm.style.display = 'none';
      if (formSuccess) {
        formSuccess.classList.add('is-shown');
        formSuccess.focus();
      }
    });
  }

})();
