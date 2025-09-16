
// ---- Speech (your function, with small safety tweaks) ----
function speak(text, clear) {
  const speechSynthesis = window.speechSynthesis;
  if (!speechSynthesis) {
    console.warn('Speech synthesis not supported in this browser');
    return;
  }

  console.log(`speak("${text}", clear=${!!clear})`);

  const desiredVoiceName = 'Daniel (English (United Kingdom))'; // customize

  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) {
    // Try again once voices are loaded
    speechSynthesis.onvoiceschanged = () => speak(text, clear);
    return;
  }
  const voice = voices.find(v => v.name === desiredVoiceName);
  console.log('Using voice:', voice ? voice.name : '(default)');

  const utter = new SpeechSynthesisUtterance(text);
  if (voice) utter.voice = voice; // only set if found
  utter.lang = 'en-US';
  utter.volume = 1;
  utter.rate = 1;
  utter.pitch = 1;

  if (clear) speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

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
    console.log('onMessage: msg', msg);
    switch (msg?.type) {
      case 'AD_SEGMENT_DETECTED': {
        // First ad segment fetched; playback will switch soon
        speak('Ad segment detected', false);
        break;
      }
      case "AD_START": {
        // Playback actually entered ad mode (after buffer delay)
        speak('Ad mode engaged', true);
        show("Ad break ▶");
        break;
      }
      case "AD_END": {
        speak('Program mode resumed', true);
        show(`Show resumed • ${(msg.durationMs/1000).toFixed(1)}s ads`);
        break;
      }
      case 'PROG_SEGMENT_DETECTED': {
        // First program segment fetched during an ad; resume soon
        speak('Program segment detected', false);
        break;
      }
      case "PROGRAM": {
        hide();
        break;
      }
    }
  });
})();
