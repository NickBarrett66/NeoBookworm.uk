(() => {
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-site-nav]");

  if (!toggle || !nav) return;

  const close = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    nav.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    if (isOpen) close();
    else open();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    if (!isOpen) return;
    if (nav.contains(target) || toggle.contains(target)) return;
    close();
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 900px)").matches) close();
  });
})();

(() => {
  const overlay = document.querySelector("[data-lightbox]");
  if (!(overlay instanceof HTMLElement)) return;

  const imgEl = overlay.querySelector("[data-lightbox-img]");
  const captionEl = overlay.querySelector("[data-lightbox-caption]");
  const closeEls = overlay.querySelectorAll("[data-lightbox-close]");
  const prevBtn = overlay.querySelector("[data-lightbox-prev]");
  const nextBtn = overlay.querySelector("[data-lightbox-next]");

  if (!(imgEl instanceof HTMLImageElement)) return;

  const links = Array.from(document.querySelectorAll("a[data-lightbox]")).filter(
    (a) => a instanceof HTMLAnchorElement && a.getAttribute("href")?.includes("images/"),
  );

  let index = -1;
  let lastActive = null;

  const setIndex = (i) => {
    index = (i + links.length) % links.length;
    const a = links[index];
    const img = a.querySelector("img");
    const href = a.getAttribute("href") || "";
    imgEl.src = href;
    imgEl.alt = img instanceof HTMLImageElement ? img.alt : "";
    if (captionEl instanceof HTMLElement) {
      captionEl.textContent = img instanceof HTMLImageElement ? img.alt : "";
    }
  };

  const open = (i) => {
    if (!links.length) return;
    lastActive = document.activeElement;
    overlay.hidden = false;
    document.documentElement.style.overflow = "hidden";
    setIndex(i);
    const closeBtn = overlay.querySelector("[data-lightbox-close]");
    if (closeBtn instanceof HTMLElement) closeBtn.focus();
  };

  const close = () => {
    overlay.hidden = true;
    document.documentElement.style.overflow = "";
    imgEl.removeAttribute("src");
    if (lastActive instanceof HTMLElement) lastActive.focus();
  };

  links.forEach((a, i) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      open(i);
    });
  });

  closeEls.forEach((el) => {
    el.addEventListener("click", () => close());
  });

  prevBtn?.addEventListener("click", () => setIndex(index - 1));
  nextBtn?.addEventListener("click", () => setIndex(index + 1));

  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") setIndex(index - 1);
    if (e.key === "ArrowRight") setIndex(index + 1);
  });
})();

(() => {
  const MESSAGES = {
    tel: "Demo site note: calling is shown for layout only. In a live build, this would open your dialler.",
    mailto: "Demo site note: email is shown for layout only. In a live build, this would open your mail app.",
    form:
      "Thanks — your message has been noted.\n\nDemo site note: this demo form doesn’t send email or store data. In a live build, this would be delivered to the business.",
  };

  const pop = document.createElement("div");
  pop.className = "demo-site-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-modal", "true");
  pop.setAttribute("aria-labelledby", "demo-site-pop-msg");
  pop.hidden = true;
  pop.innerHTML = `
    <div class="demo-site-pop__backdrop" data-demo-site-dismiss tabindex="-1"></div>
    <div class="demo-site-pop__box">
      <p class="demo-site-pop__text" id="demo-site-pop-msg"></p>
      <button type="button" class="demo-site-pop__btn" data-demo-site-dismiss>OK</button>
    </div>
  `;
  document.body.appendChild(pop);

  const msgEl = pop.querySelector("#demo-site-pop-msg");
  const okBtn = pop.querySelector(".demo-site-pop__btn");
  if (!(msgEl instanceof HTMLElement) || !(okBtn instanceof HTMLButtonElement)) return;

  /** @type {HTMLElement | null} */
  let lastFocus = null;

  const show = (kind) => {
    const text = MESSAGES[kind];
    if (!text) return;
    msgEl.textContent = text;
    pop.hidden = false;
    okBtn.focus();
  };

  const hide = () => {
    pop.hidden = true;
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  };

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    const tel = t.closest("a[href^='tel:']");
    if (tel instanceof HTMLAnchorElement) {
      e.preventDefault();
      lastFocus = tel;
      show("tel");
      return;
    }

    const mail = t.closest("a[href^='mailto:']");
    if (mail instanceof HTMLAnchorElement) {
      e.preventDefault();
      lastFocus = mail;
      show("mailto");
      return;
    }
  });

  pop.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest("[data-demo-site-dismiss]")) hide();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || pop.hidden) return;
    hide();
  });

  const form = document.querySelector("[data-contact-form]");
  if (form instanceof HTMLFormElement) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector('button[type="submit"]');
      lastFocus = submit instanceof HTMLElement ? submit : null;
      form.reset();
      show("form");
    });
  }
})();
