(() => {
  const header = document.querySelector('[data-header]');
  const nav = document.querySelector('[data-nav]');
  const toggle = document.querySelector('[data-nav-toggle]');

  if (!header || !nav || !toggle) return;

  let lastFocused = null;

  const getFocusables = () => {
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(nav.querySelectorAll(focusableSelector)).filter((el) => el instanceof HTMLElement);
  };

  const onKeydown = (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNav();
      return;
    }

    if (e.key !== 'Tab') return;
    const focusables = getFocusables();
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (!(active instanceof HTMLElement)) return;

    if (e.shiftKey) {
      if (active === first || !nav.contains(active)) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const openNav = () => {
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nav.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const focusables = getFocusables();
    if (focusables.length) focusables[0].focus();
  };

  const closeNav = () => {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  };

  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  toggle.addEventListener('click', () => {
    if (isOpen()) closeNav();
    else openNav();
  });

  document.addEventListener('keydown', onKeydown);

  nav.addEventListener('click', (e) => {
    if (!isOpen()) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('a')) closeNav();
  });

  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (header.contains(target)) return;
    closeNav();
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 48rem)').matches) closeNav();
  });
})();

(() => {
  const message =
    'Demo site note: calling is shown for layout only. In a live build, this would open your dialler.';

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[data-demo-call]');
    if (!(link instanceof HTMLAnchorElement)) return;
    e.preventDefault();
    window.alert(message);
  });
})();

(() => {
  const message =
    'Demo site note: email is shown for layout only. In a live build, this would open your mail app.';

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[data-demo-email]');
    if (!(link instanceof HTMLAnchorElement)) return;
    e.preventDefault();
    window.alert(message);
  });
})();

(() => {
  const formMessage =
    'Demo site note: sending a message is shown for layout only. In a live build, this would submit your enquiry.';

  const form = document.querySelector('form[data-demo-form]');
  if (!(form instanceof HTMLFormElement)) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    window.alert(formMessage);
  });
})();

(() => {
  const root = document.querySelector('[data-gallery]');
  const lightbox = document.querySelector('[data-lightbox]');
  const lightboxImage = document.querySelector('[data-lightbox-image]');
  const lightboxCaption = document.querySelector('[data-lightbox-caption]');
  const closeEls = document.querySelectorAll('[data-lightbox-close]');
  const prevBtn = document.querySelector('[data-lightbox-prev]');
  const nextBtn = document.querySelector('[data-lightbox-next]');

  if (!root || !lightbox || !(lightboxImage instanceof HTMLImageElement) || !lightboxCaption || !prevBtn || !nextBtn) {
    return;
  }

  const items = Array.from(root.querySelectorAll('[data-gallery-item]'));
  if (!items.length) return;

  let activeIndex = 0;
  let lastFocused = null;

  const isOpen = () => !lightbox.hasAttribute('hidden');

  const setActive = (index) => {
    const normalized = ((index % items.length) + items.length) % items.length;
    activeIndex = normalized;

    const el = items[activeIndex];
    if (!(el instanceof HTMLElement)) return;

    const src = el.getAttribute('data-src') || '';
    const caption = el.getAttribute('data-caption') || '';

    lightboxImage.src = src;
    lightboxImage.alt = caption ? caption : '';
    lightboxCaption.textContent = caption;
  };

  const open = (index) => {
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActive(index);
    lightbox.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    nextBtn.focus();
  };

  const close = () => {
    lightbox.setAttribute('hidden', '');
    document.body.style.overflow = '';
    lightboxImage.src = '';
    lightboxCaption.textContent = '';
    if (lastFocused) lastFocused.focus();
  };

  items.forEach((btn, index) => {
    btn.addEventListener('click', () => open(index));
  });

  prevBtn.addEventListener('click', () => setActive(activeIndex - 1));
  nextBtn.addEventListener('click', () => setActive(activeIndex + 1));

  closeEls.forEach((el) => {
    el.addEventListener('click', () => {
      if (isOpen()) close();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive(activeIndex - 1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActive(activeIndex + 1);
    }
  });
})();
