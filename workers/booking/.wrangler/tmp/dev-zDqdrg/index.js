var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-MJQ9Q5/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/config.js
var SLUG_CONFIG = {
  hetyres: {
    displayName: "HE Tyres",
    calendarId: null,
    // falls back to env.GOOGLE_CALENDAR_ID
    slotDuration: 30,
    minLeadMinutes: 60,
    // can't book a slot starting within the next hour
    maxAdvanceDays: 60,
    // furthest ahead a slot can be booked
    timezone: "Europe/London",
    workingHours: {
      1: { open: "08:30", close: "17:00" },
      // Mon
      2: { open: "08:30", close: "17:00" },
      3: { open: "08:30", close: "17:00" },
      4: { open: "08:30", close: "17:00" },
      5: { open: "08:30", close: "17:00" },
      // Fri
      6: { open: "08:30", close: "12:30" }
      // Sat
    }
  }
};
function getConfig(slug) {
  return SLUG_CONFIG[slug] ?? null;
}
__name(getConfig, "getConfig");

// src/calendar.js
var TOKEN_CACHE_KEY = "gtoken";
var TOKEN_TTL_SECONDS = 3300;
var DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const p = dtf.formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}
__name(tzOffsetMs, "tzOffsetMs");
function londonWallToInstant(wall, timeZone = "Europe/London") {
  const guess = /* @__PURE__ */ new Date(wall + "Z");
  const offset = tzOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}
__name(londonWallToInstant, "londonWallToInstant");
function getTodayIso(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(/* @__PURE__ */ new Date());
}
__name(getTodayIso, "getTodayIso");
function getDayOfWeek(isoDate, timeZone) {
  const noon = londonWallToInstant(`${isoDate}T12:00:00`, timeZone);
  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(noon);
  return DOW_MAP[dayName];
}
__name(getDayOfWeek, "getDayOfWeek");
function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
__name(addDays, "addDays");
function instantToWallString(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const p = dtf.formatToParts(instant).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
__name(instantToWallString, "instantToWallString");
function instantToTimeLabel(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return dtf.format(instant);
}
__name(instantToTimeLabel, "instantToTimeLabel");
function calendarIdFor(env, config) {
  return config?.calendarId ?? env.GOOGLE_CALENDAR_ID;
}
__name(calendarIdFor, "calendarIdFor");
async function getAccessToken(env) {
  const cached = await env.TOKEN_CACHE.get(TOKEN_CACHE_KEY, "json");
  if (cached?.token && cached.expiresAt > Date.now() + 6e4) {
    return cached.token;
  }
  console.log("[booking] fetching new Google access token");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1e3;
  await env.TOKEN_CACHE.put(
    TOKEN_CACHE_KEY,
    JSON.stringify({ token: data.access_token, expiresAt }),
    { expirationTtl: TOKEN_TTL_SECONDS }
  );
  return data.access_token;
}
__name(getAccessToken, "getAccessToken");
async function getBusyPeriods(env, isoDate, config = SLUG_CONFIG.hetyres) {
  const timeZone = config.timezone;
  const calendarId = calendarIdFor(env, config);
  const timeMin = londonWallToInstant(`${isoDate}T00:00:00`, timeZone).toISOString();
  const timeMax = londonWallToInstant(`${addDays(isoDate, 1)}T00:00:00`, timeZone).toISOString();
  const token = await getAccessToken(env);
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }]
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google freeBusy failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy.map(({ start, end }) => ({
    start: new Date(start),
    end: new Date(end)
  }));
}
__name(getBusyPeriods, "getBusyPeriods");
function getWorkingSlots(isoDate, config = SLUG_CONFIG.hetyres) {
  const timeZone = config.timezone;
  const today = getTodayIso(timeZone);
  if (isoDate < today)
    return [];
  const dayOfWeek = getDayOfWeek(isoDate, timeZone);
  const hours = config.workingHours[dayOfWeek];
  if (!hours)
    return [];
  const { open, close } = hours;
  const durationMs = config.slotDuration * 6e4;
  const slots = [];
  let cursor = londonWallToInstant(`${isoDate}T${open}:00`, timeZone);
  const dayEnd = londonWallToInstant(`${isoDate}T${close}:00`, timeZone);
  while (cursor.getTime() + durationMs <= dayEnd.getTime()) {
    const end = new Date(cursor.getTime() + durationMs);
    slots.push({ start: new Date(cursor), end });
    cursor = end;
  }
  return slots;
}
__name(getWorkingSlots, "getWorkingSlots");
function filterAvailableSlots(workingSlots, busyPeriods, config = SLUG_CONFIG.hetyres) {
  const timeZone = config.timezone;
  return workingSlots.filter(
    (slot) => !busyPeriods.some(
      (busy) => slot.start < busy.end && slot.end > busy.start
    )
  ).map((slot) => instantToWallString(slot.start, timeZone));
}
__name(filterAvailableSlots, "filterAvailableSlots");
function wallSlotsToLabels(wallSlots, timeZone = "Europe/London") {
  return wallSlots.map((wall) => {
    const instant = londonWallToInstant(wall, timeZone);
    return instantToTimeLabel(instant, timeZone);
  });
}
__name(wallSlotsToLabels, "wallSlotsToLabels");

// src/index.js
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}
__name(jsonResponse, "jsonResponse");
function getTodayLondon() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(/* @__PURE__ */ new Date());
}
__name(getTodayLondon, "getTodayLondon");
function addDays2(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
__name(addDays2, "addDays");
function validateDateParam(date, config) {
  if (!date) {
    return { error: "Missing date parameter", status: 400 };
  }
  if (!ISO_DATE_RE.test(date)) {
    return { error: "Invalid date format \u2014 use YYYY-MM-DD", status: 400 };
  }
  const today = getTodayLondon();
  if (date < today) {
    return { error: "Date is in the past", status: 400 };
  }
  const maxDate = addDays2(today, config.maxAdvanceDays);
  if (date > maxDate) {
    return { error: `Date is more than ${config.maxAdvanceDays} days ahead`, status: 400 };
  }
  return null;
}
__name(validateDateParam, "validateDateParam");
async function handleSlots(slug, url, env) {
  const config = getConfig(slug);
  if (!config) {
    return jsonResponse({ error: "Unknown booking slug" }, 404);
  }
  const date = url.searchParams.get("date");
  const validationError = validateDateParam(date, config);
  if (validationError) {
    return jsonResponse({ error: validationError.error }, validationError.status);
  }
  const workingSlots = getWorkingSlots(date, config);
  if (workingSlots.length === 0) {
    return jsonResponse({ date, slots: [] });
  }
  try {
    const busyPeriods = await getBusyPeriods(env, date, config);
    const availableWall = filterAvailableSlots(workingSlots, busyPeriods, config);
    const slots = wallSlotsToLabels(availableWall, config.timezone);
    return jsonResponse({ date, slots });
  } catch (err) {
    console.error("[booking] slots error:", err);
    return jsonResponse({ error: "Unable to fetch availability" }, 502);
  }
}
__name(handleSlots, "handleSlots");
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
    const slotsMatch = url.pathname.match(/^\/([^/]+)\/slots$/);
    if (req.method === "GET" && slotsMatch) {
      return handleSlots(slotsMatch[1], url, env);
    }
    return new Response(`NeoBookworm Booking \u2014 ${url.pathname}`, {
      headers: { "Content-Type": "text/plain" }
    });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-MJQ9Q5/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-MJQ9Q5/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
