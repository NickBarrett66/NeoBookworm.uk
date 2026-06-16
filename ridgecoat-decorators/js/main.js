/* Ridgecoat Decorators Ltd demo site — vanilla JS only */

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
  const telMessage = "Demo site: this action is disabled.";
  const mailMessage =
    "Demo site: email is disabled here — this demo doesn’t open a mail client or send messages.";

  document.addEventListener("click", (e) => {
    const tel = e.target.closest('a[href^="tel:"][data-demo-block]');
    if (tel) {
      e.preventDefault();
      window.alert(telMessage);
      return;
    }

    const mail = e.target.closest('a[href^="mailto:"][data-demo-block]');
    if (mail) {
      e.preventDefault();
      window.alert(mailMessage);
    }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-demo-block]");
    if (!form) return;
    e.preventDefault();
    window.alert(telMessage);
  });
}

function initContactFormDemoUX() {
  const form = document.querySelector("form[data-demo-form]");
  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
  const bannerEl = form.querySelector("[data-form-success-banner]");
  const successEl = form.querySelector("[data-form-success]");
  const dismissBtn = form.querySelector("[data-form-dismiss]");
  const message = "Thanks — we’ve got your message. We’ll be in touch as soon as we can.";

  function showSuccess() {
    if (bannerEl && successEl) {
      successEl.textContent = message;
      bannerEl.hidden = false;
      window.requestAnimationFrame(() => {
        successEl.focus();
      });
      return;
    }
    if (successEl) {
      successEl.textContent = message;
      successEl.hidden = false;
    } else {
      window.alert(message);
    }
  }

  function hideSuccess() {
    if (bannerEl) bannerEl.hidden = true;
    else if (successEl) successEl.hidden = true;
    if (successEl) successEl.textContent = "";
    if (submitBtn) submitBtn.disabled = false;
  }

  function dismissSuccess() {
    form.reset();
    hideSuccess();
    const first = form.querySelector("#full-name");
    if (first && typeof first.focus === "function") first.focus();
  }

  if (dismissBtn) dismissBtn.addEventListener("click", dismissSuccess);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!bannerEl || bannerEl.hidden) return;
    e.preventDefault();
    dismissSuccess();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const hp = form.querySelector("#company");
    if (hp && String(hp.value || "").trim() !== "") {
      if (submitBtn) submitBtn.disabled = true;
      showSuccess();
      return;
    }

    if (!form.reportValidity()) return;

    if (submitBtn) submitBtn.disabled = true;
    showSuccess();
  });
}

function initGalleryLightbox() {
  const lightbox = document.querySelector("[data-gallery-lightbox]");
  const grid = document.querySelector("[data-gallery-grid]");
  if (!lightbox || !grid) return;

  const triggers = Array.from(grid.querySelectorAll("[data-gallery-item]"));
  if (!triggers.length) return;

  const imgEl = lightbox.querySelector("[data-lightbox-img]");
  const capEl = lightbox.querySelector("[data-lightbox-caption]");
  const dialog = lightbox.querySelector("[data-lightbox-dialog]");
  const backdrop = lightbox.querySelector("[data-lightbox-backdrop]");
  const closeBtn = lightbox.querySelector("[data-lightbox-close]");
  const prevBtn = lightbox.querySelector("[data-lightbox-prev]");
  const nextBtn = lightbox.querySelector("[data-lightbox-next]");

  if (!imgEl || !capEl || !dialog || !backdrop || !closeBtn || !prevBtn || !nextBtn) return;

  const slides = triggers.map((t) => ({
    src: t.getAttribute("data-full-src") || "",
    alt: t.getAttribute("data-alt") || "",
    caption: t.getAttribute("data-caption-long") || "",
  }));

  let index = 0;
  let untrap = null;
  let lastFocus = null;
  let keyHandler = null;

  function isOpen() {
    return !lightbox.hasAttribute("hidden");
  }

  function render() {
    const s = slides[index];
    if (!s || !s.src) return;
    imgEl.src = s.src;
    imgEl.alt = s.alt;
    capEl.textContent = s.caption;
  }

  function go(delta) {
    index = (index + delta + slides.length) % slides.length;
    render();
  }

  function close() {
    if (!isOpen()) return;

    lightbox.setAttribute("hidden", "");
    document.documentElement.style.overflow = "";
    if (untrap) untrap();
    untrap = null;

    if (keyHandler) {
      document.removeEventListener("keydown", keyHandler);
      keyHandler = null;
    }

    imgEl.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    imgEl.alt = "";
    capEl.textContent = "";

    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function open(i) {
    index = (i + slides.length) % slides.length;
    lastFocus = document.activeElement;

    lightbox.removeAttribute("hidden");
    document.documentElement.style.overflow = "hidden";
    render();

    untrap = trapFocus(dialog, closeBtn);

    keyHandler = (e) => {
      if (!isOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };

    document.addEventListener("keydown", keyHandler);
  }

  triggers.forEach((btn, i) => {
    btn.addEventListener("click", () => open(i));
  });

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  prevBtn.addEventListener("click", () => go(-1));
  nextBtn.addEventListener("click", () => go(1));
}

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initDemoActionBlockers();
  initContactFormDemoUX();
  initGalleryLightbox();
});

