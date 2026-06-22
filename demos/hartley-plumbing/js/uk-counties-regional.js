/**
 * Preset “regional coverage” highlights for initNeoUkCountiesMap (NeoBookworm demos).
 *
 * Load after Leaflet and uk-counties-leaflet.js:
 *   <script src="../js/uk-counties-leaflet.js"></script>
 *   <script src="../js/uk-counties-regional.js"></script>
 *   <script>
 *     initNeoUkRegionalCountiesMap('map-uk', { scrollWheelZoom: false });
 *   </script>
 *
 * Default highlighted areas: Gloucestershire, Wiltshire, Oxfordshire, Warwickshire, Swindon.
 * By default fitHighlightedBounds is true (map zooms to those areas). Pass fitHighlightedBounds: false
 * to keep options.center / options.zoom instead.
 */
(function (global) {
  'use strict';

  var DEFAULT_HIGHLIGHTED = [
    'Gloucestershire',
    'Wiltshire',
    'Oxfordshire',
    'Warwickshire',
    'Swindon'
  ];

  function initNeoUkRegionalCountiesMap(containerId, options) {
    if (typeof global.initNeoUkCountiesMap !== 'function') {
      throw new Error('initNeoUkRegionalCountiesMap: load uk-counties-leaflet.js first.');
    }
    options = options || {};
    var merged = Object.assign({}, options);
    if (!merged.highlighted || !merged.highlighted.length) {
      merged.highlighted = DEFAULT_HIGHLIGHTED.slice();
    }
    if (merged.fitHighlightedBounds === undefined) {
      merged.fitHighlightedBounds = true;
    }
    return global.initNeoUkCountiesMap(containerId, merged);
  }

  global.NEO_UK_REGIONAL_HIGHLIGHTS = DEFAULT_HIGHLIGHTED.slice();
  global.initNeoUkRegionalCountiesMap = initNeoUkRegionalCountiesMap;
})(typeof window !== 'undefined' ? window : this);
