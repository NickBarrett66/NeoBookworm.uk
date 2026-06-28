/* Frayne Lofts demo site — vanilla JS only */
/* Gallery lightbox removed — R2 image grid in use */

function getFocusableWithin(root) {
  return Array.from(
    root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function trapFocus(modalEl, initialFocusEl) {
  const focusable = getFocusableWithin(modalEl);
  const first = initialFocusEl || focusable[0];
  const last = focusable[focusable.length - 1];

  if (first) first.focus();

  function onKeyDown(e) {
    if (e.key !== "Tab") return;
    if (focusable.length === 0) return;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
      return;
    }

    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  modalEl.addEventListener("keydown", onKeyDown);
  return () => modalEl.removeEventListener("keydown", onKeyDown);
}

function initMobileNav() {
  const overlay = document.querySelector("[data-nav-overlay]");
  const openBtn = document.querySelector("[data-nav-open]");
  const closeBtn = document.querySelector("[data-nav-close]");

  if (!overlay || !openBtn || !closeBtn) return;

  let untrap = null;
  let lastFocused = null;

  function open() {
    lastFocused = document.activeElement;
    overlay.dataset.open = "true";
    overlay.setAttribute("aria-hidden", "false");
    openBtn.setAttribute("aria-expanded", "true");
    document.documentElement.style.overflow = "hidden";
    untrap = trapFocus(overlay, closeBtn);
  }

  function close() {
    overlay.dataset.open = "false";
    overlay.setAttribute("aria-hidden", "true");
    openBtn.setAttribute("aria-expanded", "false");
    document.documentElement.style.overflow = "";
    if (untrap) untrap();
    untrap = null;
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  openBtn.addEventListener("click", () => open());
  closeBtn.addEventListener("click", () => close());

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.dataset.open === "true") close();
  });
}

function initDemoActionBlockers() {
  const message = "Demo site: this action is disabled. Use the contact form to request a quote.";

  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="tel:"][data-demo-block]');
    if (!link) return;
    e.preventDefault();
    window.alert(message);
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-demo-block]");
    if (!form) return;
    e.preventDefault();
    window.alert(message);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initDemoActionBlockers();
});

