(function () {
  const badge = document.createElement('div');
  badge.style.cssText = `
    position: fixed; z-index: 2147483647; top: 8px; right: 8px;
    font: 12px/1.2 system-ui, sans-serif; padding: 6px 8px; border-radius: 8px;
    background: rgba(0,0,0,.65); color: #fff; pointer-events: none;
  `;
  document.documentElement.appendChild(badge);

  function show(txt) { badge.textContent = txt; badge.style.display = 'block'; }
  function hide() { badge.style.display = 'none'; }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "AD_START") show("Ad break ▶");
    if (msg.type === "AD_END") show(`Show resumed • ${(msg.durationMs/1000).toFixed(1)}s ads`);
    if (msg.type === "PROGRAM") hide();
  });
})();
