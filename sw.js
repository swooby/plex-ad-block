//
// ---------- Ad detector with verbose logging ----------

// --- Playback alignment (precise, segment-based) ---
const SEG_DUR_DEFAULT_MS = 6000;   // until measured
const LEAD_START_SEGS     = 2.0;   // ~2 segments until playback flips to ad
const LEAD_END_SEGS       = 2.0;   // ~2 segments until playback flips back to program

// Absolute-time scheduler (reschedules both earlier and later)
function scheduleAt(s, key, dueMsEpoch, fn, meta = {}) {
  if (!s._timers) s._timers = {};
  const existing = s._timers[key];
  // Re-arm if no existing or due changed by > 200ms
  if (existing && Math.abs(existing.due - dueMsEpoch) <= 200) return existing.due;
  if (existing) { try { clearTimeout(existing.id); } catch {} }
  const delay = Math.max(0, dueMsEpoch - Date.now());
  const id = setTimeout(() => {
    if (s._timers && s._timers[key] && s._timers[key].id === id) {
      delete s._timers[key];
      fn();
    }
  }, delay);
  s._timers[key] = { id, due: dueMsEpoch, meta };
  return dueMsEpoch;
}
function cancelTimer(s, key) {
  if (s._timers && s._timers[key]) {
    try { clearTimeout(s._timers[key].id); } catch {}
    delete s._timers[key];
  }
}
function medianMs(arr) {
  if (!arr || !arr.length) return null;
  const a = arr.slice().sort((x,y)=>x-y);
  const n = a.length;
  return n & 1 ? a[(n-1)>>1] : Math.round((a[n/2-1] + a[n/2]) / 2);
}

// ---- Timing log helper (current estimate + predicted edges) ----
function logSegmentTiming(tabId, s, label) {
  const segMs = s._adSegMs || SEG_DUR_DEFAULT_MS;
  const adStartDue = s._firstAdAt != null ? s._firstAdAt + (s._leadStartSegs ?? LEAD_START_SEGS) * segMs : null;
  const adEndDue   = s._firstProgAfterAdAt != null ? s._firstProgAfterAdAt + (s._leadEndSegs ?? LEAD_END_SEGS) * segMs : null;
  const now = Date.now();
  debugLog('SEG_TIMING', {
    tabId,
    label,
    segMs,
    lastCreative: s._lastAdCreative || null,
    lastIdx: Number.isFinite(s._lastAdIdx) ? s._lastAdIdx : null,
    deltas: s._adDeltas || [],
    adStartDue,
    adStartISO: adStartDue ? new Date(adStartDue).toISOString() : null,
    inMsToAdStart: adStartDue ? (adStartDue - now) : null,
    adEndDue,
    adEndISO: adEndDue ? new Date(adEndDue).toISOString() : null,
    inMsToAdEnd: adEndDue ? (adEndDue - now) : null
  });
}

// Broader patterns (ad/program) and tolerant to query strings + CMAF
// Broader patterns (ad/program) and tolerant to query strings + CMAF
const RE = {
  AD: [
    /\/ads\/tm\/[^/]+\/([0-9a-f-]{8,})\/asset(\d+)k_(\d+)\.(?:ts|m4s|mp4)(?:\?.*)?$/i,
    /\/ads\/[^?#]+\.(?:ts|m4s|mp4)(?:\?.*?(?:ad|creative|vast|adid)=.*?)?$/i,
    /[?&](?:ad|creative|vast|adid)=[^&]+/i
  ],

  // FULL SHOW program segments (require multiple numeric folders + 32-hex folder)
  PROG_FULL: [
    /\/(?:\d+\/){2,}\d+\/[0-9a-f]{32}\/hls-v\d?\/\d+-\d+\.(?:ts|m4s|mp4)(?:\?.*)?$/i
  ],

  // Intro bumpers / time fillers (single numeric folder before /hls-v…)
  PROG_BUMPER: [
    /\/\d+\/hls-v\d?\/\d+-\d+\.(?:ts|m4s|mp4)(?:\?.*)?$/i
  ],

  // Keep a broad fallback matcher for visibility-only (we won’t use it to change state)
  PROG_ANY: [
    /\/hls-v\d?\/\d+-\d+\.(?:ts|m4s|mp4)(?:\?.*)?$/i,
    /\/(?:hls|hls-v\d+|chunk|segments?|frag)[^/]*\/[^/]+\.(?:ts|m4s|mp4)(?:\?.*)?$/i
  ],

  MEDIATAILOR: /:\/\/[^/]*mediatailor\.amazonaws\.com\/v1\/(?:segment|manifest)\//i
};

function isMatch(url, list) {
  for (const r of list) {
    const m = url.match(r);
    if (m) return m;
  }
  return null;
}

// --- Debug logging (console + small ring buffer you can pull) ---
const LOG_BUFFER_MAX = 500;
const logBuffer = []; // [{t,event,tabId,type,method,initiator,url,extra?}]
function debugLog(event, payload) {
  const rec = { t: Date.now(), event, ...payload };
  logBuffer.push(rec);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  try {
    console.log(
      `[ADDETECT] ${event} tab=${payload.tabId} ${payload.type || ''} ${payload.method || ''} ${payload.url || ''}`,
      rec
    );
  } catch {}
}

// Allow popup/devtools to dump logs
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'LOG_DUMP') {
    sendResponse({ ok: true, items: logBuffer.slice(-200) });
    return true;
  }
});

// Simple FSM keyed by tabId to decide AD vs PROGRAM
const stateByTab = new Map(); // tabId -> {mode, breakStart, dedupe:Set, lastSeen:ms, ... }

function setBadge(tabId, mode) {
  if (tabId <= 0) return;
  const text = mode === "AD" ? "AD" : "";
  chrome.action.setBadgeText({ tabId, text });
  if (mode === "AD") chrome.action.setBadgeBackgroundColor({ tabId, color: "#cc3333" });
}
function ensureTabState(tabId) {
  if (!stateByTab.has(tabId)) {
    stateByTab.set(tabId, { mode: "PROGRAM", breakStart: null, dedupe: new Set(), lastSeen: Date.now() });
  }
  return stateByTab.get(tabId);
}
function maybeNotify(tabId, kind, payload) {
  chrome.tabs.sendMessage(tabId, { type: kind, ...payload }).catch(()=>{});
  if (kind === "AD_START") setBadge(tabId, "AD");
  if (kind === "AD_END" || kind === "PROGRAM") setBadge(tabId, "PROGRAM");
}

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && stateByTab.has(tabId)) {
    const s = stateByTab.get(tabId);
    cancelTimer(s, 'adStart');
    cancelTimer(s, 'adEnd');
    stateByTab.delete(tabId);
    debugLog('TAB_RESET', { tabId });
  }
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { tabId = -1, url, type, method, initiator } = details;
    if (tabId < 0) return;

    // 1) ALWAYS log the hit BEFORE classification
    //debugLog('URL', { tabId, type, method, initiator, url });

    const s = ensureTabState(tabId);
    s.lastSeen = Date.now();

    // 2) MediaTailor (optional breadcrumb)
    if (RE.MEDIATAILOR.test(url)) {
      s._lastMT = Date.now();
      debugLog('MEDIATAILOR', { tabId, url });
      return;
    }

    // 3) --- AD segments ---
    const adMatch = isMatch(url, RE.AD);
    if (adMatch) {
      const now = Date.now();
      const creative = adMatch[1] || null;
      const segIdxStr = adMatch[3] || null;
      const segIdx = segIdxStr ? parseInt(segIdxStr, 10) : NaN;

      // Dedupe key (creative:index if available)
      const key = (creative && Number.isFinite(segIdx)) ? `${creative}:${segIdx}` : url;
      if (!s.dedupe.has(key)) s.dedupe.add(key);

      // --- Learn segment duration from consecutive indices of same creative ---
      if (creative && Number.isFinite(segIdx)) {
        if (s._lastAdCreative === creative && Number.isFinite(s._lastAdIdx) && segIdx === s._lastAdIdx + 1) {
          const dt = now - (s._lastAdAt || now);
          if (dt > 500 && dt < 20000) {
            s._adDeltas = s._adDeltas || [];
            s._adDeltas.push(dt);
            if (s._adDeltas.length > 7) s._adDeltas.shift();
          }
        }
        s._lastAdCreative = creative;
        s._lastAdIdx = segIdx;
        s._lastAdAt = now;
      }

      const segMsMeasured = medianMs(s._adDeltas) || s._adSegMs || SEG_DUR_DEFAULT_MS;
      s._adSegMs = Math.min(12000, Math.max(3000, segMsMeasured));

      debugLog('AD_URL', {
        tabId, url, creative, segIdx,
        dedupeSize: s.dedupe.size,
        segMsEst: s._adSegMs, deltas: s._adDeltas || []
      });

      // If we were counting down to AD_END (thinking resume imminent), cancel; ads still going
      cancelTimer(s, 'adEnd');

      // First ad boundary timestamp (one-shot)
      if (s._firstAdAt == null) {
        s._firstAdAt = now;
        s._firstAdUrl = url;
        if (!s._firstAdNotified) {
          s._firstAdNotified = true;
          maybeNotify(tabId, "AD_SEGMENT_DETECTED", { at: now, url });
        }
      }

      // Already "in AD"? nothing else to do.
      if (s.mode === 'AD') {
        logSegmentTiming(tabId, s, 'AD_MEASURE_IN_AD');
        return;
      }

      // --- Playback-aligned AD_START: fire at absolute T = firstAdAt + lead*segMs ---
      s._leadStartSegs = s._leadStartSegs ?? LEAD_START_SEGS;
      const due = s._firstAdAt + s._leadStartSegs * s._adSegMs;

      const scheduled = scheduleAt(s, 'adStart', due, () => {
        if (s.mode !== 'AD') {
          s.mode = 'AD';
          s.breakStart = Date.now();
          debugLog('AD_START_TIMER_FIRED', {
            tabId, url: s._firstAdUrl || url,
            segMs: s._adSegMs, leadSegs: s._leadStartSegs
          });
          logSegmentTiming(tabId, s, 'AD_START_FIRED');
          maybeNotify(tabId, 'AD_START', { at: s.breakStart, url: s._firstAdUrl || url });
        }
      }, { url, segMs: s._adSegMs, leadSegs: s._leadStartSegs });

      debugLog('AD_START_SCHEDULED', { tabId, due: scheduled, inMs: scheduled - now, segMs: s._adSegMs, leadSegs: s._leadStartSegs });
      logSegmentTiming(tabId, s, 'AD_SCHEDULED');
      return;
    }

    // 4) --- Program segments ---
    const progFullMatch   = isMatch(url, RE.PROG_FULL);
    const progBumperMatch = !progFullMatch && isMatch(url, RE.PROG_BUMPER);
    const progAnyMatch    = !progFullMatch && !progBumperMatch && isMatch(url, RE.PROG_ANY);

    if (progBumperMatch) {
      // Ignore bumpers/time fillers for state changes
      debugLog('PROG_BUMPER', { tabId, url });
      maybeNotify(tabId, "PROG_BUMPER", { at: now, url });
      return;
    }

    if (progFullMatch) {
      const now = Date.now();
      s.lastProgAt = now;
      debugLog('PROG_FULLSHOW', { tabId, url });

      if (s.mode === 'AD') {
        // First program segment after ad boundary (one-shot)
        if (s._firstProgAfterAdAt == null) {
          s._firstProgAfterAdAt = now;
          s._firstProgUrl = url;
          if (!s._firstProgNotified) {
            s._firstProgNotified = true;
            maybeNotify(tabId, "PROG_SEGMENT_DETECTED", { at: now, url });
          }
        }

        s._leadEndSegs = s._leadEndSegs ?? LEAD_END_SEGS;
        const segMs = s._adSegMs || SEG_DUR_DEFAULT_MS; // last good estimate
        const due = s._firstProgAfterAdAt + s._leadEndSegs * segMs;

        const scheduled = scheduleAt(s, 'adEnd', due, () => {
          if (s.mode === 'AD') {
            const at = Date.now();
            const durationMs = s.breakStart ? at - s.breakStart : 0;
            const segments = s.dedupe.size;
            debugLog('AD_END_TIMER_FIRED', { tabId, at, durationMs, segments, segMs, leadSegs: s._leadEndSegs });
            logSegmentTiming(tabId, s, 'AD_END_FIRED');
            maybeNotify(tabId, 'AD_END', { at, durationMs, segments });

            // reset state for next break (keep segMs history)
            s.mode = 'PROGRAM';
            s.breakStart = null;
            s.dedupe.clear();
            s._firstAdAt = null; s._firstAdUrl = null; s._firstAdNotified = false;
            s._firstProgAfterAdAt = null; s._firstProgUrl = null; s._firstProgNotified = false;
          }
        }, { url, segMs, leadSegs: s._leadEndSegs });

        debugLog('AD_END_SCHEDULED', { tabId, due: scheduled, inMs: scheduled - now, segMs, leadSegs: s._leadEndSegs });
        logSegmentTiming(tabId, s, 'PROG_SCHEDULED');
      } else {
        // Not in AD: only announce PROGRAM on full show URLs
        maybeNotify(tabId, 'PROGRAM', { url });
      }
      return;
    }

    // For visibility: log other program-ish hits we ignored (neither full nor bumper)
    if (progAnyMatch) {
      debugLog('PROG_OTHER_IGNORED', { tabId, url });
    }
  },
  {
    urls: [
      "*://*.plex.wurl.tv/*",
      "*://*.wurl.tv/*",
      "*://*.wurl.com/*",
      "*://*.mediatailor.amazonaws.com/*"
    ],
    types: ["xmlhttprequest","media","other"]
  }
);

debugLog('SW_BOOT', {
  tabId: -1,
  url: 'service-worker',
  version: chrome.runtime.getManifest().version,
  knobs: { SEG_DUR_DEFAULT_MS, LEAD_START_SEGS, LEAD_END_SEGS }
});

//
// ---------- OBS WebSocket (v5) utilities ----------

async function sha256ToBase64(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  let bin = '';
  const bytes = new Uint8Array(hash);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function computeObsAuth(password, salt, challenge) {
  const secret = await sha256ToBase64((password || '') + (salt || ''));
  const auth = await sha256ToBase64(secret + (challenge || ''));
  return auth;
}
function testObsConnection({ host, port, password }, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const url = `ws://${host}:${port}`;
    let ws;                        // moved up to avoid TDZ warnings in timer
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { ws && ws.close(); } catch {}
      resolve({ ok: false, error: `Timeout while connecting to ${url}` });
    }, timeoutMs);

    try {
      ws = new WebSocket(url);
    } catch (e) {
      clearTimeout(timer);
      return resolve({ ok: false, error: `WebSocket error: ${e.message || e}` });
    }

    ws.addEventListener('error', () => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve({ ok: false, error: `WebSocket error` });
    });

    ws.addEventListener('close', (ev) => {
      if (done) return;
      done = true; clearTimeout(timer);
      const code = ev && ev.code;
      if (code === 4005) return resolve({ ok: false, error: 'Authentication failed (4005). Wrong password?' });
      if (code === 4009) return resolve({ ok: false, error: 'Unsupported protocol version (4009).' });
      resolve({ ok: false, error: `Closed (code ${code || 'n/a'})` });
    });

    ws.addEventListener('message', async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.op === 0 && msg.d) {
          const rpc = msg.d.rpcVersion || 1;
          const helloAuth = msg.d.authentication;
          const identify = { op: 1, d: { rpcVersion: rpc, eventSubscriptions: 0 } };
          if (helloAuth) {
            try {
              const auth = await computeObsAuth(password || '', helloAuth.salt || '', helloAuth.challenge || '');
              identify.d.authentication = auth;
            } catch {}
          }
          ws.send(JSON.stringify(identify));
          return;
        }
        if (msg.op === 2 && msg.d) {
          const rpc = msg.d.negotiatedRpcVersion;
          if (!done) {
            done = true; clearTimeout(timer);
            try { ws.close(); } catch {}
            resolve({ ok: true, authenticated: true, rpcVersion: rpc });
          }
        }
      } catch {}
    });
  });
}

// Listen for popup messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'OBS_TEST') {
    (async () => {
      try {
        const res = await testObsConnection(msg.payload || {});
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : 'Unknown error' });
      }
    })();
    return true; // keep channel open for async response
  }
});
