// Simple FSM keyed by tabId to decide AD vs PROGRAM
const AD_URL = /\/ads\/tm\/[^/]+\/([0-9a-f-]{8,})\/asset(\d+)k_(\d+)\.ts/i;
const PROG_URL = /\/hls-v2\/\d+-\d+\.ts$/i;
const MEDIATAILOR = /:\/\/[^/]*mediatailor\.amazonaws\.com\/v1\/segment\//i;

const stateByTab = new Map(); // tabId -> {mode, breakStart, dedupe:Set, lastSeen:ms}

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
  // UI ping to overlay + console for dev
  chrome.tabs.sendMessage(tabId, { type: kind, ...payload }).catch(()=>{});
  if (kind === "AD_START") setBadge(tabId, "AD");
  if (kind === "AD_END" || kind === "PROGRAM") setBadge(tabId, "PROGRAM");
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { tabId = -1, url } = details;
    if (tabId < 0) return;

    const s = ensureTabState(tabId);
    s.lastSeen = Date.now();

    // Optional: note MediaTailor beacons during ads
    if (MEDIATAILOR.test(url)) {
      // could be used as a pre-signal; not required
      return;
    }

    const adMatch = url.match(AD_URL);
    if (adMatch) {
      const creative = adMatch[1];
      const segIdx = adMatch[3];
      const key = `${creative}:${segIdx}`;
      if (!s.dedupe.has(key)) {
        s.dedupe.add(key);
      }

      if (s.mode !== "AD") {
        // Require at least 2 ad hits within 2s to avoid false start (prefetch/probe)
        const now = Date.now();
        if (s._pendingAd && now - s._pendingAd < 2000) {
          s.mode = "AD";
          s.breakStart = now;
          maybeNotify(tabId, "AD_START", { at: now, url });
          delete s._pendingAd;
        } else {
          s._pendingAd = Date.now();
        }
      }
      return;
    }

    const progMatch = url.match(PROG_URL);
    if (progMatch) {
      if (s.mode === "AD") {
        const now = Date.now();
        const durationMs = s.breakStart ? now - s.breakStart : 0;
        const segments = s.dedupe.size;
        const summary = { at: now, durationMs, segments };
        maybeNotify(tabId, "AD_END", summary);
        // Reset
        s.mode = "PROGRAM";
        s.breakStart = null;
        s.dedupe.clear();
      } else {
        maybeNotify(tabId, "PROGRAM", { url });
      }
    }
  },
  {
    urls: [
      "*://*.plex.wurl.tv/*",
      "*://*.mediatailor.amazonaws.com/*"
    ]
  }
);
