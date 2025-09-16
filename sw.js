//
// ---------- Ad detector with verbose logging ----------

// --- Simple segment counting thresholds ---
const AD_SEGMENTS_REQUIRED = 4;
const PROGRAM_SEGMENTS_REQUIRED = 2;

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
    stateByTab.set(tabId, {
      mode: "PROGRAM",
      breakStart: null,
      dedupe: new Set(),
      progDedupe: new Set(),
      adSegmentsSeen: 0,
      programSegmentsSeen: 0,
      firstAdUrl: null,
      programModeAdCount: 0,
      adModeProgramCount: 0,
      lastSeen: Date.now(),
    });
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
    stateByTab.delete(tabId);
    debugLog('TAB_RESET', { tabId });
  }
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const now = Date.now();
    const { tabId = -1, url, type, method, initiator } = details;
    if (tabId < 0) return;

    // 1) ALWAYS log the hit BEFORE classification
    //debugLog('URL', { tabId, type, method, initiator, url });

    const s = ensureTabState(tabId);
    s.lastSeen = now;

    // 2) MediaTailor (optional breadcrumb)
    if (RE.MEDIATAILOR.test(url)) {
      s._lastMT = now;
      debugLog('MEDIATAILOR', { tabId, url });
      return;
    }

    // 3) --- AD segments ---
    const adMatch = isMatch(url, RE.AD);
    if (adMatch) {
      const creative = adMatch[1] || null;
      const segIdxStr = adMatch[3] || null;
      const segIdx = segIdxStr ? parseInt(segIdxStr, 10) : NaN;

      // Dedupe key (creative:index if available)
      const key = (creative && Number.isFinite(segIdx)) ? `${creative}:${segIdx}` : url;
      const isNewSegment = !s.dedupe.has(key);
      if (isNewSegment) {
        s.dedupe.add(key);
        s.adSegmentsSeen = s.dedupe.size;
        if (!s.firstAdUrl) s.firstAdUrl = url;
        if (s.mode !== 'AD') {
          const index = s.programModeAdCount;
          debugLog('PROGRAM_MODE_AD_SEGMENT', { tabId, url, index });
          maybeNotify(tabId, 'PROGRAM_MODE_AD_SEGMENT', { at: now, url, index });
          s.programModeAdCount += 1;

          debugLog('AD_SEGMENT_COUNT', { tabId, url, adSegmentsSeen: s.adSegmentsSeen, required: AD_SEGMENTS_REQUIRED });
          if (s.adSegmentsSeen >= AD_SEGMENTS_REQUIRED) {
            s.mode = 'AD';
            s.breakStart = now;
            s.programSegmentsSeen = 0;
            s.adModeProgramCount = 0;
            s.progDedupe.clear();
            debugLog('AD_MODE_ENTER', { tabId, url: s.firstAdUrl || url, adSegments: s.adSegmentsSeen });
            maybeNotify(tabId, 'AD_START', { at: s.breakStart, url: s.firstAdUrl || url });
          }
        } else {
          s.programSegmentsSeen = 0;
          s.adModeProgramCount = 0;
          s.progDedupe.clear();
        }
      } else if (s.mode === 'AD') {
        s.programSegmentsSeen = 0;
        s.adModeProgramCount = 0;
      }

      debugLog('AD_URL', {
        tabId, url, creative, segIdx,
        dedupeSize: s.dedupe.size,
        adSegmentsSeen: s.adSegmentsSeen,
        mode: s.mode,
      });
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
      s.lastProgAt = now;
      debugLog('PROG_FULLSHOW', { tabId, url });

      if (s.mode === 'AD') {
        const isNewProgSegment = !s.progDedupe.has(url);
        if (isNewProgSegment) {
          s.progDedupe.add(url);
          s.programSegmentsSeen += 1;
          const index = s.adModeProgramCount;
          debugLog('AD_MODE_PROGRAM_SEGMENT', { tabId, url, index });
          maybeNotify(tabId, 'AD_MODE_PROGRAM_SEGMENT', { at: now, url, index });
          s.adModeProgramCount += 1;
          debugLog('PROG_SEGMENT_COUNT', { tabId, url, programSegmentsSeen: s.programSegmentsSeen, required: PROGRAM_SEGMENTS_REQUIRED });
          if (s.programSegmentsSeen >= PROGRAM_SEGMENTS_REQUIRED) {
            const at = now;
            const durationMs = s.breakStart ? at - s.breakStart : 0;
            const segments = s.dedupe.size;
            debugLog('AD_MODE_EXIT', { tabId, url, durationMs, segments, programSegments: s.programSegmentsSeen });
            maybeNotify(tabId, 'AD_END', { at, durationMs, segments });

            s.mode = 'PROGRAM';
            s.breakStart = null;
            s.dedupe.clear();
            s.progDedupe.clear();
            s.adSegmentsSeen = 0;
            s.programSegmentsSeen = 0;
            s.firstAdUrl = null;
            s.programModeAdCount = 0;
            s.adModeProgramCount = 0;
          }
        }
      } else {
        s.progDedupe.clear();
        s.programSegmentsSeen = 0;
        if (s.dedupe.size || s.adSegmentsSeen) {
          s.dedupe.clear();
          s.adSegmentsSeen = 0;
        }
        s.firstAdUrl = null;
        s.programModeAdCount = 0;
        s.adModeProgramCount = 0;
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
  knobs: { AD_SEGMENTS_REQUIRED, PROGRAM_SEGMENTS_REQUIRED }
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
