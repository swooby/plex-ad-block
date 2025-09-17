let speechEnabled = true;
const speechPrefPromise = new Promise((resolve) => {
  if (chrome?.storage?.local?.get) {
    try {
      chrome.storage.local.get({ speechEnabled: true }, (res) => {
        if (chrome.runtime?.lastError) {
          console.warn('Failed to load speech setting', chrome.runtime.lastError);
        } else if (res) {
          speechEnabled = res.speechEnabled !== false;
        }
        resolve();
      });
    } catch (err) {
      console.warn('Failed to load speech setting', err);
      resolve();
    }
  } else {
    resolve();
  }
});

const MEDIA_ELEMENT_SELECTOR = 'video.HTMLMedia-mediaElement-u17S9P';
const VOLUME_ATTENUATION_LEVEL = 0.05;
const MEDIA_WAIT_RETRY_DELAY_MS = 250;
const MEDIA_WAIT_MAX_ATTEMPTS = 20;

let savedMediaVolume = null;
let savedMediaElement = null;

function findMediaElement() {
  return document.querySelector(MEDIA_ELEMENT_SELECTOR);
}

function waitForMediaElement(attempt = 0) {
  return new Promise((resolve) => {
    const media = findMediaElement();
    if (media) {
      resolve(media);
      return;
    }
    if (attempt >= MEDIA_WAIT_MAX_ATTEMPTS) {
      resolve(null);
      return;
    }
    setTimeout(() => {
      waitForMediaElement(attempt + 1).then(resolve);
    }, MEDIA_WAIT_RETRY_DELAY_MS);
  });
}

function clampVolume(volume) {
  if (!Number.isFinite(volume)) {
    return null;
  }
  if (volume < 0) {
    return 0;
  }
  if (volume > 1) {
    return 1;
  }
  return volume;
}

async function saveVolumeAndAttenuate() {
  const media = await waitForMediaElement();
  if (!media) {
    console.warn('Media element for volume attenuation not found');
    return;
  }

  const currentVolume = clampVolume(media.volume);
  if (currentVolume === null) {
    console.warn('Unable to determine current media volume', media.volume);
    return;
  }

  if (savedMediaVolume === null || savedMediaElement !== media) {
    savedMediaElement = media;
    savedMediaVolume = currentVolume;
  }

  const targetVolume = clampVolume(Math.min(currentVolume, VOLUME_ATTENUATION_LEVEL));
  if (targetVolume !== null && media.volume !== targetVolume) {
    try {
      media.volume = targetVolume;
    } catch (error) {
      console.warn('Failed to attenuate media volume', error);
    }
  }
}

async function restoreSavedVolume() {
  if (savedMediaVolume === null) {
    return;
  }

  const media = (savedMediaElement && document.contains(savedMediaElement))
    ? savedMediaElement
    : await waitForMediaElement();

  if (!media) {
    console.warn('Media element for volume restoration not found');
    savedMediaElement = null;
    savedMediaVolume = null;
    return;
  }

  const volumeToRestore = clampVolume(savedMediaVolume);
  if (volumeToRestore !== null) {
    try {
      media.volume = volumeToRestore;
    } catch (error) {
      console.warn('Failed to restore media volume', error);
    }
  }

  savedMediaElement = null;
  savedMediaVolume = null;
}

if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes?.speechEnabled) {
      speechEnabled = changes.speechEnabled.newValue !== false;
    }
  });
}

// ---- Speech (your function, with small safety tweaks) ----
async function speak(text, clear) {
  await speechPrefPromise;

  const speechSynthesis = window.speechSynthesis;

  if (!speechEnabled) {
    if (clear && speechSynthesis) {
      try { speechSynthesis.cancel(); } catch {}
    }
    console.log('Speech disabled; skipping speak()', text);
    return;
  }

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
      case 'PROGRAM_MODE_AD_SEGMENT': {
        const index = Number.isFinite(msg.index) ? msg.index : 0;
        speak(`Ad segment ${index}`, false);
        break;
      }
      case "AD_START": {
        // Playback actually entered ad mode (after buffer delay)
        speak('Ad mode engaged', true);
        show("Ad break ▶");
        saveVolumeAndAttenuate();
        break;
      }
      case "AD_END": {
        speak('Program mode resumed', true);
        show(`Show resumed • ${(msg.durationMs/1000).toFixed(1)}s ads`);
        restoreSavedVolume();
        break;
      }
      case 'PROG_BUMPER': {
        // A short bumper/time filler clip; ignore
        speak('Program bumper detected', false);
        break;
      }
      case 'AD_MODE_PROGRAM_BUMPER': {
        const index = Number.isFinite(msg.index) ? msg.index : 0;
        speak(`Program bumper ${index}`, false);
        break;
      }
      case 'AD_MODE_PROGRAM_SEGMENT': {
        const index = Number.isFinite(msg.index) ? msg.index : 0;
        speak(`Program segment ${index}`, false);
        break;
      }
      case "PROGRAM": {
        hide();
        break;
      }
    }
  });
})();
