const els = {
  host: document.getElementById('host'),
  port: document.getElementById('port'),
  password: document.getElementById('password'),
  togglePw: document.getElementById('togglePw'),
  save: document.getElementById('save'),
  test: document.getElementById('test'),
  status: document.getElementById('status'),
};

function showStatus(ok, msg) {
  els.status.className = ok ? 'ok' : 'err';
  els.status.textContent = msg;
  els.status.style.display = 'block';
}

async function load() {
  const { obsConfig } = await chrome.storage.local.get('obsConfig');
  const cfg = Object.assign({ host: 'localhost', port: 4455, password: '' }, obsConfig || {});
  els.host.value = cfg.host;
  els.port.value = cfg.port;
  els.password.value = cfg.password || '';

  // Init toggle
  els.password.type = 'password';
  els.togglePw.setAttribute('aria-pressed', 'false');
  els.togglePw.setAttribute('aria-label', 'Show password');
  els.togglePw.textContent = 'Show';
}

async function save() {
  const obsConfig = {
    host: (els.host.value || 'localhost').trim(),
    port: Number(els.port.value || 4455),
    password: els.password.value || ''
  };
  await chrome.storage.local.set({ obsConfig });
  showStatus(true, 'Saved.');
}

async function test() {
  const payload = {
    host: (els.host.value || 'localhost').trim(),
    port: Number(els.port.value || 4455),
    password: els.password.value || ''
  };
  showStatus(true, 'Testing…');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'OBS_TEST', payload });
    if (res && res.ok) {
      showStatus(true, `Connected${res.authenticated ? ' & authenticated' : ''}${res.rpcVersion ? ` (RPC v${res.rpcVersion})` : ''}`);
    } else {
      showStatus(false, res && res.error ? res.error : 'Failed to connect.');
    }
  } catch (e) {
    showStatus(false, e && e.message ? e.message : 'Failed to connect.');
  }
}

// Password show/hide
els.togglePw.addEventListener('click', () => {
  const hidden = els.password.type === 'password';
  els.password.type = hidden ? 'text' : 'password';
  els.togglePw.setAttribute('aria-pressed', hidden ? 'true' : 'false');
  els.togglePw.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
  els.togglePw.textContent = hidden ? 'Hide' : 'Show';
  try { els.password.focus({ preventScroll: true }); } catch {}
});

els.save.addEventListener('click', save);
els.test.addEventListener('click', test);
load();

document.getElementById('dumpLogsBtn')?.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'LOG_DUMP' });
  if (res?.ok) {
    console.table(res.items.map(x => ({
      t: new Date(x.t).toLocaleTimeString(),
      event: x.event,
      tab: x.tabId,
      url: x.url?.slice(0,180) || ''
    })));
  }
});
