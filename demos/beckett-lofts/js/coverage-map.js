/**
 * Beckett Lofts — service area map (Leaflet + OpenStreetMap).
 * Used on contact.html (#contact-map) and about.html (#about-map).
 */
(function () {
  var LOCATIONS = [
    { pos: [51.348, -2.252], label: "S", title: "Bradford on Avon" },
    { pos: [51.381386, -2.359696], label: "B", title: "Bath" },
    { pos: [51.459066, -2.116074], label: "C", title: "Chippenham" },
    { pos: [51.4323, -2.1849], label: "Co", title: "Corsham" },
    { pos: [51.319, -2.208], label: "T", title: "Trowbridge" },
    { pos: [51.229, -2.322], label: "F", title: "Frome" },
    { pos: [51.413, -2.497], label: "K", title: "Keynsham" },
    { pos: [51.372, -2.141], label: "M", title: "Melksham" },
  ];

  function initMap(containerId) {
    var mapEl = document.getElementById(containerId);
    if (!mapEl || typeof L === "undefined") return;

    var centre = LOCATIONS[0].pos;
    var map = L.map(containerId, { zoomControl: true, scrollWheelZoom: false }).setView(centre, 10);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    var css = getComputedStyle(document.documentElement);
    var gold = (css.getPropertyValue("--color-accent") || "#C89B2D").trim();
    var ink = (css.getPropertyValue("--color-primary") || "#2B2416").trim();

    var circle = L.circle(centre, {
      radius: 40233.6,
      color: gold,
      weight: 2,
      opacity: 0.8,
      fillColor: gold,
      fillOpacity: 0.08,
    }).addTo(map);

    function refit() {
      map.fitBounds(circle.getBounds(), { padding: [18, 18] });
    }
    refit();

    LOCATIONS.forEach(function (loc) {
      var fs = String(loc.label).length > 1 ? 10 : 11;
      var svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34">' +
        '<circle cx="17" cy="17" r="15" fill="' +
        gold +
        '" stroke="rgba(255,255,255,0.85)" stroke-width="2"/>' +
        '<text x="17" y="17" text-anchor="middle" dominant-baseline="central" font-family="Sora, system-ui, sans-serif" font-size="' +
        fs +
        '" font-weight="900" fill="' +
        ink +
        '">' +
        loc.label +
        "</text></svg>";
      var icon = L.divIcon({ html: svg, className: "", iconSize: [34, 34], iconAnchor: [17, 17] });
      L.marker(loc.pos, { icon: icon, title: loc.title }).addTo(map);
    });

    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function () {
        map.invalidateSize();
        refit();
      });
      ro.observe(mapEl);
    }
  }

  function boot() {
    if (typeof L === "undefined") return;
    ["contact-map", "about-map"].forEach(function (id) {
      if (document.getElementById(id)) initMap(id);
    });
  }

  function whenLeafletReady(fn) {
    if (typeof L !== "undefined") {
      fn();
      return;
    }
    var check = setInterval(function () {
      if (typeof L !== "undefined") {
        clearInterval(check);
        fn();
      }
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      whenLeafletReady(boot);
    });
  } else {
    whenLeafletReady(boot);
  }
})();
