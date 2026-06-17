/**
 * UK counties / unitary authorities map (Leaflet + ONS GeoJSON via ArcGIS).
 *
 * Dependencies (load before this file):
 *   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
 *   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
 *
 * HTML: a single element with a stable id, e.g.
 *   <div id="map-uk" style="width:100%;height:520px;border-radius:12px;overflow:hidden"></div>
 *
 * JS:
 *   initNeoUkCountiesMap('map-uk', {
 *     highlighted: ['Gloucestershire', 'Wiltshire', 'Swindon'],
 *     zoom: 6
 *   });
 *
 * Region names are matched with substring search on CTYUA24NM / CTY24NM / name (empty needles are ignored;
 * otherwise indexOf('') matches every name and would frame the whole dataset).
 *
 * fitHighlightedBounds: after load, map.fitBounds() to the union of highlighted features.
 * Defaults to true when highlighted[] is non-empty; set false for a fixed center/zoom overview.
 *
 * Data: Counties_and_Unitary_Authorities_December_2024_Boundaries_UK_BUC (ONS GeoJSON via ArcGIS).
 * (Older service name …EN_BUC… was removed — use …Boundaries_UK_BUC….)
 */
(function (global) {
  'use strict';

  /** Current ONS ArcGIS GeoJSON endpoint (BUC boundaries). */
  var CANONICAL_GEOJSON_URL =
    'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Counties_and_Unitary_Authorities_December_2024_Boundaries_UK_BUC/FeatureServer/0/query?where=1%3D1&outFields=CTYUA24NM&returnGeometry=true&resultRecordCount=2000&f=geojson&geometryPrecision=4&outSR=4326';

  var DEFAULT_GEOJSON_URL = CANONICAL_GEOJSON_URL;

  var DEFAULT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';

  /** Older builds used …December_2024_EN_BUC… (404). Retry canonical URL if that request fails. */
  var DEPRECATED_EN_BUC_MARKER = 'Counties_and_Unitary_Authorities_December_2024_EN_BUC';

  function fetchGeoJsonWithFallback(url) {
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) {
        if (r.ok) {
          return r.json();
        }
        if (url.indexOf(DEPRECATED_EN_BUC_MARKER) !== -1 && url !== CANONICAL_GEOJSON_URL) {
          return fetch(CANONICAL_GEOJSON_URL, { cache: 'no-cache' }).then(function (r2) {
            if (!r2.ok) {
              return Promise.reject(new Error('HTTP ' + r2.status + ' from GeoJSON endpoint'));
            }
            return r2.json();
          });
        }
        return Promise.reject(new Error('HTTP ' + r.status + ' from GeoJSON endpoint'));
      });
  }

  /** Some ONS features can yield non-finite corners; skip them so fitBounds never sees NaN. */
  function boundsAreFinite(b) {
    if (!b || typeof b.isValid !== 'function' || !b.isValid()) {
      return false;
    }
    try {
      var sw = b.getSouthWest();
      var ne = b.getNorthEast();
      return (
        isFinite(sw.lat) &&
        isFinite(sw.lng) &&
        isFinite(ne.lat) &&
        isFinite(ne.lng)
      );
    } catch (e) {
      return false;
    }
  }

  function geoJsonFeaturesList(data) {
    if (!data) {
      return [];
    }
    if (data.type === 'FeatureCollection' && data.features) {
      return data.features;
    }
    if (data.type === 'Feature') {
      return [data];
    }
    return [];
  }

  /**
   * Bounds for only matching features, using Leaflet's GeoJSON parser (same geometry path as drawing).
   */
  function boundsFromMatchingLeafletGeoJSON(data, isHighlightedFn, featureNameFn) {
    var features = geoJsonFeaturesList(data).filter(function (f) {
      return isHighlightedFn(featureNameFn(f));
    });
    if (!features.length) {
      return { bounds: L.latLngBounds([]), count: 0 };
    }
    var gj = L.geoJSON({ type: 'FeatureCollection', features: features });
    var b = gj.getBounds();
    if (!boundsAreFinite(b)) {
      return { bounds: L.latLngBounds([]), count: 0 };
    }
    return { bounds: b, count: features.length };
  }

  /** Retry until Leaflet map has non-zero size (fitBounds/getBoundsZoom misbehave at 0×0). */
  function whenMapHasSize(map, fn, maxAttempts) {
    var attempts = 0;
    maxAttempts = maxAttempts != null ? maxAttempts : 50;
    function tick() {
      map.invalidateSize();
      var size = map.getSize();
      if (size && size.x > 0 && size.y > 0) {
        fn();
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(tick, 40);
      } else {
        fn();
      }
    }
    tick();
  }

  /** GeoJSON positions are [lng, lat]. Walk nested rings / polygons. */
  function extendLngLatCoords(coords, acc) {
    if (!coords || !coords.length) {
      return;
    }
    if (typeof coords[0] === 'number') {
      var lng = coords[0];
      var lat = coords[1];
      if (isFinite(lat) && isFinite(lng)) {
        acc.minLat = Math.min(acc.minLat, lat);
        acc.maxLat = Math.max(acc.maxLat, lat);
        acc.minLng = Math.min(acc.minLng, lng);
        acc.maxLng = Math.max(acc.maxLng, lng);
      }
      return;
    }
    for (var i = 0; i < coords.length; i += 1) {
      extendLngLatCoords(coords[i], acc);
    }
  }

  function extendGeometryLngLat(geom, acc) {
    if (!geom) {
      return;
    }
    if (geom.type === 'GeometryCollection' && geom.geometries) {
      for (var gi = 0; gi < geom.geometries.length; gi += 1) {
        extendGeometryLngLat(geom.geometries[gi], acc);
      }
      return;
    }
    if (geom.coordinates) {
      extendLngLatCoords(geom.coordinates, acc);
    }
  }

  /**
   * Union of lat/lng extents for highlighted features — does not depend on Leaflet layer.getBounds().
   */
  function boundsFromHighlightedGeometry(data, isHighlightedFn, featureNameFn) {
    var acc = {
      minLat: Infinity,
      maxLat: -Infinity,
      minLng: Infinity,
      maxLng: -Infinity
    };
    var n = 0;
    var list = geoJsonFeaturesList(data);
    for (var i = 0; i < list.length; i += 1) {
      var feature = list[i];
      if (!isHighlightedFn(featureNameFn(feature)) || !feature.geometry) {
        continue;
      }
      extendGeometryLngLat(feature.geometry, acc);
      n += 1;
    }
    if (n === 0 || acc.minLat === Infinity || !isFinite(acc.minLat)) {
      return { bounds: L.latLngBounds([]), count: 0 };
    }
    var hb = L.latLngBounds(
      L.latLng(acc.minLat, acc.minLng),
      L.latLng(acc.maxLat, acc.maxLng)
    );
    return { bounds: hb, count: n };
  }

  /** Union bounds from raw GeoJSON features (fallback). */
  function boundsForHighlightedFeatures(data, isHighlightedFn, featureNameFn) {
    var hb = L.latLngBounds([]);
    var n = 0;
    var list = geoJsonFeaturesList(data);
    for (var i = 0; i < list.length; i += 1) {
      var feature = list[i];
      if (!isHighlightedFn(featureNameFn(feature))) {
        continue;
      }
      try {
        var tmp = L.geoJSON(feature);
        var b = tmp.getBounds();
        if (boundsAreFinite(b)) {
          hb.extend(b);
          n += 1;
        }
      } catch (e) {
        /* skip bad geometry */
      }
    }
    return { bounds: hb, count: n };
  }

  /**
   * Bounds from layers already on the map (Leaflet sets layer.feature).
   * Recurses into MultiPolygon / nested groups so we do not miss highlighted areas.
   */
  function boundsFromRenderedGeoJsonLayer(geojsonLayer, isHighlightedFn, featureNameFn) {
    var hb = L.latLngBounds([]);
    var n = 0;
    function walk(layer) {
      if (!layer) {
        return;
      }
      var feat = layer.feature;
      if (feat && isHighlightedFn(featureNameFn(feat))) {
        if (typeof layer.getBounds === 'function') {
          try {
            var b = layer.getBounds();
            if (boundsAreFinite(b)) {
              hb.extend(b);
              n += 1;
            }
          } catch (e) {
            /* skip */
          }
        }
      }
      if (layer.eachLayer) {
        layer.eachLayer(walk);
      }
    }
    walk(geojsonLayer);
    return { bounds: hb, count: n };
  }

  function initNeoUkCountiesMap(containerId, options) {
    if (typeof L === 'undefined') {
      throw new Error('initNeoUkCountiesMap: Leaflet (L) is not loaded.');
    }

    options = options || {};
    var rawHighlighted = options.highlighted;
    if (!Array.isArray(rawHighlighted)) {
      rawHighlighted = rawHighlighted != null && rawHighlighted !== '' ? [rawHighlighted] : [];
    }
    var highlighted = rawHighlighted
      .map(function (h) {
        return h == null ? '' : String(h).trim();
      })
      .filter(function (h) {
        return h.length > 0;
      });
    var center = options.center || [54.5, -3.0];
    var zoom = options.zoom != null ? options.zoom : 6;
    var scrollWheelZoom = options.scrollWheelZoom != null ? options.scrollWheelZoom : false;
    var geoJsonUrl = options.geoJsonUrl || DEFAULT_GEOJSON_URL;
    var tileUrl = options.tileUrl || DEFAULT_TILE_URL;
    var tileAttribution =
      options.tileAttribution ||
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

    var fitHighlightedBounds;
    if (options.fitHighlightedBounds === false) {
      fitHighlightedBounds = false;
    } else if (options.fitHighlightedBounds === true) {
      fitHighlightedBounds = true;
    } else {
      fitHighlightedBounds = highlighted.length > 0;
    }
    var fitBoundsPadding = options.fitBoundsPadding != null ? options.fitBoundsPadding : 28;
    var fitBoundsMaxZoom = options.fitBoundsMaxZoom != null ? options.fitBoundsMaxZoom : 12;

    var defaultStyle = {
      color: '#94a3b8',
      weight: 0.8,
      fillColor: '#cbd5e1',
      fillOpacity: 0.4
    };

    var highlightStyle = {
      color: '#1d4ed8',
      weight: 1.5,
      fillColor: '#3b82f6',
      fillOpacity: 0.35
    };

    var hoverStyle = {
      weight: 2,
      fillOpacity: 0.6
    };

    var el = document.getElementById(containerId);
    if (!el) {
      throw new Error('initNeoUkCountiesMap: element #' + containerId + ' not found.');
    }

    var map = L.map(containerId, {
      center: center,
      zoom: zoom,
      zoomControl: true,
      scrollWheelZoom: scrollWheelZoom
    });

    L.tileLayer(tileUrl, {
      attribution: tileAttribution,
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    var geojsonLayer;

    var tooltip = document.createElement('div');
    tooltip.style.cssText =
      'position:absolute;background:#1e293b;color:#f1f5f9;padding:5px 10px;border-radius:6px;font-size:12px;pointer-events:none;display:none;z-index:9999;white-space:nowrap';
    el.appendChild(tooltip);

    function isHighlighted(name) {
      var n = name ? String(name).trim() : '';
      if (!n) {
        return false;
      }
      var nLower = n.toLowerCase();
      return highlighted.some(function (h) {
        return h.length > 0 && nLower.indexOf(h.toLowerCase()) !== -1;
      });
    }

    function featureName(feature) {
      var raw =
        (feature.properties && feature.properties.CTYUA24NM) ||
        (feature.properties && feature.properties.CTY24NM) ||
        (feature.properties && feature.properties.name) ||
        '';
      return raw ? String(raw).trim() : '';
    }

    function onEachFeature(feature, layer) {
      var name = featureName(feature);

      layer.on({
        mouseover: function (e) {
          var l = e.target;
          l.setStyle(hoverStyle);
          l.bringToFront();
          tooltip.textContent = name;
          tooltip.style.display = 'block';
        },
        mousemove: function (e) {
          var container = el.getBoundingClientRect();
          var x = e.originalEvent.clientX - container.left + 12;
          var y = e.originalEvent.clientY - container.top - 28;
          tooltip.style.left = x + 'px';
          tooltip.style.top = y + 'px';
        },
        mouseout: function (e) {
          geojsonLayer.resetStyle(e.target);
          tooltip.style.display = 'none';
        }
      });
    }

    function styleFeature(feature) {
      var name = featureName(feature);
      return isHighlighted(name) ? highlightStyle : defaultStyle;
    }

    return fetchGeoJsonWithFallback(geoJsonUrl).then(function (data) {
        geojsonLayer = L.geoJSON(data, {
          style: styleFeature,
          onEachFeature: onEachFeature
        }).addTo(map);

        var legend = L.control({ position: 'bottomright' });
        legend.onAdd = function () {
          var div = L.DomUtil.create('div');
          div.style.cssText =
            'background:white;padding:10px 14px;border-radius:8px;font-size:12px;line-height:1.8;box-shadow:0 1px 4px rgba(0,0,0,0.15)';
          div.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
            '<span style="display:inline-block;width:14px;height:14px;background:#3b82f6;border-radius:2px;opacity:0.8"></span>' +
            '<span style="color:#1e293b">Featured region</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="display:inline-block;width:14px;height:14px;background:#cbd5e1;border-radius:2px"></span>' +
            '<span style="color:#1e293b">Other counties</span>' +
            '</div>';
          return div;
        };
        legend.addTo(map);

        if (fitHighlightedBounds && highlighted.length) {
          var fitResult = boundsFromMatchingLeafletGeoJSON(data, isHighlighted, featureName);
          if (fitResult.count === 0 || !boundsAreFinite(fitResult.bounds)) {
            fitResult = boundsFromHighlightedGeometry(data, isHighlighted, featureName);
          }
          if (fitResult.count === 0 || !boundsAreFinite(fitResult.bounds)) {
            fitResult = boundsFromRenderedGeoJsonLayer(geojsonLayer, isHighlighted, featureName);
          }
          if (fitResult.count === 0 || !boundsAreFinite(fitResult.bounds)) {
            fitResult = boundsForHighlightedFeatures(data, isHighlighted, featureName);
          }
          if (fitResult.count > 0 && boundsAreFinite(fitResult.bounds)) {
            var fb = fitResult.bounds;
            var pad = fitBoundsPadding;
            var mz = fitBoundsMaxZoom;
            function applyFitBounds() {
              try {
                map.invalidateSize();
                map.fitBounds(fb, {
                  padding: pad,
                  maxZoom: mz,
                  animate: false
                });
              } catch (fitErr) {
                try {
                  var padSum = L.point(pad, pad).add(L.point(pad, pad));
                  var z = map.getBoundsZoom(fb, false, padSum);
                  if (mz != null && isFinite(mz)) {
                    z = Math.min(z, mz);
                  }
                  if (isFinite(z) && z !== Infinity) {
                    map.setView(fb.getCenter(), z, { animate: false });
                  }
                } catch (e2) {
                  if (typeof console !== 'undefined' && console.warn) {
                    console.warn('initNeoUkCountiesMap: fitBounds/setView failed', fitErr && fitErr.message ? fitErr.message : fitErr);
                  }
                }
              }
            }
            whenMapHasSize(map, function () {
              applyFitBounds();
              setTimeout(applyFitBounds, 120);
            });
          }
        }

        return { map: map, layer: geojsonLayer };
      })
      .catch(function (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('initNeoUkCountiesMap:', err && err.message ? err.message : err);
        }
        el.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font-size:14px;font-family:sans-serif">Map data could not be loaded. Check your connection.</div>';
        return null;
      });
  }

  global.initNeoUkCountiesMap = initNeoUkCountiesMap;
})(typeof window !== 'undefined' ? window : this);
