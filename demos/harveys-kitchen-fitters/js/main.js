/* Harvey's Kitchen Fitters — main.js (vanilla) */

const DEMO_BANNER_KEY = "nbw_harveysDemoBannerDismissed_v1";

/* ── Helpers ── */
function getPathBasename() {
  const path = window.location.pathname;
  const last = path.split("/").filter(Boolean).pop() || "index.html";
  return last;
}

/* ── Demo banner ── */
function initDemoBanner() {
  const banner = document.querySelector("[data-demo-banner]");
  if (!banner) return;

  const dismissed = localStorage.getItem(DEMO_BANNER_KEY) === "1";
  if (dismissed) {
    banner.classList.add("is-dismissed");
    return;
  }

  const closeBtn = banner.querySelector("[data-banner-close]");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      localStorage.setItem(DEMO_BANNER_KEY, "1");
      banner.classList.add("is-dismissed");
    });
  }
}

/* ── Header shadow on scroll ── */
function initHeaderShadow() {
  const header = document.querySelector("[data-site-header]");
  if (!header) return;
  const onScroll = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 4);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ── Active nav link ── */
function initNavActive() {
  const basename = getPathBasename();
  const links = document.querySelectorAll("[data-nav] a[href], [data-nav-drawer] a[href]");

  links.forEach((a) => {
    const href = a.getAttribute("href") || "";
    const hrefBase = href.split("/").filter(Boolean).pop();
    const isHome = basename === "" || basename === "index.html";
    const match =
      (isHome && (hrefBase === "index.html" || href === "/" || href === "./")) ||
      (!!hrefBase && hrefBase === basename);
    if (match) a.classList.add("nav__link--active");
  });
}

/* ── Mobile nav drawer ── */
function initNavDrawer() {
  const openBtn = document.querySelector("[data-nav-open]");
  const closeBtn = document.querySelector("[data-nav-close]");
  const overlay = document.querySelector("[data-nav-overlay]");
  const drawer = document.querySelector("[data-nav-drawer]");
  if (!openBtn || !closeBtn || !overlay || !drawer) return;

  drawer.setAttribute("inert", "");
  overlay.setAttribute("inert", "");
  openBtn.setAttribute("aria-expanded", "false");

  const open = () => {
    document.body.classList.add("nav-open");
    drawer.setAttribute("aria-hidden", "false");
    overlay.setAttribute("aria-hidden", "false");
    drawer.removeAttribute("inert");
    overlay.removeAttribute("inert");
    openBtn.setAttribute("aria-expanded", "true");
    closeBtn.focus();
  };
  const close = () => {
    document.body.classList.remove("nav-open");
    drawer.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
    overlay.setAttribute("inert", "");
    openBtn.setAttribute("aria-expanded", "false");
    openBtn.focus();
  };

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);
  drawer.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest("a[href]")) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("nav-open")) close();
  });
}

/* ── Toast ── */
function initToast() {
  const toast = document.querySelector("[data-toast]");
  if (!toast) return null;

  let t = null;
  const show = (title, msg) => {
    const titleEl = toast.querySelector("[data-toast-title]");
    const msgEl = toast.querySelector("[data-toast-msg]");
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = msg;
    toast.hidden = false;
    clearTimeout(t);
    t = setTimeout(() => { toast.hidden = true; }, 5200);
  };
  return { show };
}

/* ── Demo blocked actions (tel: + form submit) ── */
function initDemoBlockedActions() {
  const toast = initToast();
  if (!toast) return;

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const link = e.target.closest("a[href^='tel:']");
    if (!link) return;
    e.preventDefault();
    const display = link.textContent?.trim() || "this number";
    toast.show("Demo site", `Calls are disabled here. On a live site, tapping this would call ${display}.`);
  });

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.hasAttribute("data-demo-block-submit")) return;
    e.preventDefault();
    toast.show("Demo site", "This form doesn't send in the demo. On a live site, it would email Harvey's directly.");
  });
}

/* ── Contact form: client-side validation ── */
function initContactForm() {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const successMsg = form.querySelector("[data-form-success]");

  const validate = (input) => {
    const group = input.closest(".form-group");
    if (!group) return true;
    const errorEl = group.querySelector(".form-error");

    let valid = true;
    const val = input.value.trim();

    if (input.required && !val) { valid = false; }
    if (input.type === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { valid = false; }

    group.classList.toggle("is-invalid", !valid);
    if (errorEl) errorEl.textContent = !valid ? (input.dataset.error || "This field is required.") : "";
    return valid;
  };

  form.querySelectorAll("input, textarea, select").forEach((input) => {
    input.addEventListener("blur", () => validate(input));
    input.addEventListener("input", () => {
      const group = input.closest(".form-group");
      if (group?.classList.contains("is-invalid")) validate(input);
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let allValid = true;
    form.querySelectorAll("input[required], textarea[required], select[required]").forEach((input) => {
      if (!validate(input)) allValid = false;
    });
    if (!allValid) return;

    if (successMsg) {
      form.style.display = "none";
      successMsg.classList.add("is-visible");
      successMsg.focus();
    }
  });
}

/* ── Gallery lightbox ── */
function initLightbox() {
  const root = document.querySelector("[data-lightbox]");
  if (!(root instanceof HTMLElement)) return;

  const overlay = root.querySelector("[data-lightbox-overlay]");
  const closeBtn = root.querySelector("[data-lightbox-close]");
  const img = root.querySelector("[data-lightbox-img]");
  if (!overlay || !closeBtn || !img) return;

  let lastFocus = null;

  const open = (src, alt) => {
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    img.src = src;
    img.alt = alt || "";
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    closeBtn.focus();
  };
  const close = () => {
    overlay.hidden = true;
    img.src = "";
    document.body.style.overflow = "";
    lastFocus?.focus();
  };

  document.querySelectorAll("[data-lightbox-trigger]").forEach((btn) => {
    btn.addEventListener("click", () => {
      open(btn.dataset.lightboxSrc || "", btn.dataset.lightboxAlt || "");
    });
  });

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });
}

/* ── Init ── */
document.addEventListener("DOMContentLoaded", () => {
  initDemoBanner();
  initHeaderShadow();
  initNavActive();
  initNavDrawer();
  initDemoBlockedActions();
  initContactForm();
  initLightbox();
});
