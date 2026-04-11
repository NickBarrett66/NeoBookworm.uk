(function () {
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

  document.querySelectorAll('nav.site-nav').forEach(function (nav) {
    var btn = nav.querySelector('.nav-toggle');
    var menu = nav.querySelector('#primary-nav') || nav.querySelector('.nav-links');
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
