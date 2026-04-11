(function () {
  var mq = window.matchMedia('(max-width: 768px)');

  function getNav() {
    return document.querySelector('nav.site-nav');
  }

  function getMenu() {
    return document.getElementById('primary-nav');
  }

  /**
   * iOS Chrome / WebKit: position:fixed inside <nav> can still clip to the nav box
   * when filters or stacking contexts apply. Moving #primary-nav under <body> fixes it.
   */
  function syncMenuParent() {
    var nav = getNav();
    var menu = getMenu();
    if (!nav || !menu) return;

    if (mq.matches) {
      if (menu.parentNode !== document.body) {
        document.body.appendChild(menu);
        menu.setAttribute('data-nav-mobile-body', '');
      }
    } else {
      if (menu.hasAttribute('data-nav-mobile-body')) {
        nav.appendChild(menu);
        menu.removeAttribute('data-nav-mobile-body');
      }
    }
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(syncMenuParent, 100);
  });

  if (mq.addEventListener) {
    mq.addEventListener('change', syncMenuParent);
  } else if (mq.addListener) {
    mq.addListener(syncMenuParent);
  }

  function closeNav(nav) {
    nav.classList.remove('nav-open');
    document.body.classList.remove('nav-menu-open');
    var btn = nav.querySelector('.nav-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    }
  }

  function openNav(nav) {
    nav.classList.add('nav-open');
    document.body.classList.add('nav-menu-open');
    var btn = nav.querySelector('.nav-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close menu');
    }
  }

  syncMenuParent();

  document.querySelectorAll('nav.site-nav').forEach(function (nav) {
    var btn = nav.querySelector('.nav-toggle');
    var menu = getMenu();
    if (!btn || !menu) return;

    btn.addEventListener('click', function () {
      if (nav.classList.contains('nav-open')) closeNav(nav);
      else openNav(nav);
    });

    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        closeNav(nav);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('nav-open')) closeNav(nav);
    });
  });
})();
