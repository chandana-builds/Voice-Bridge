const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const convEl = document.getElementById('conversation');
const recognizedPane = document.getElementById('recognizedPane');
const fromLangEl = document.getElementById('fromLang');
const toLangEl = document.getElementById('toLang');
const inputTextEl = document.getElementById('inputText');
const translateTextBtn = document.getElementById('translateTextBtn');
const outputTextEl = document.getElementById('outputText');
const listenOutputBtn = document.getElementById('listenOutputBtn');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  console.warn('Web Speech API not supported in this browser.');
}

let recognition = SpeechRecognition ? new SpeechRecognition() : null;
let accumulatedSpeech = ''; // store text from mic session
const conversationLog = []; // store all turns

if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = false;
}

// No local voices needed for Google Translate TTS API

function setStatus(message, opts = {}) {
  const dot = statusEl.querySelector('.status-dot') || (() => {
    const d = document.createElement('span');
    d.className = 'status-dot';
    statusEl.prepend(d);
    return d;
  })();
  dot.classList.toggle('live', !!opts.live);
  statusEl.classList.toggle('error', !!opts.error);

  let strong = statusEl.querySelector('strong');
  if (!strong) {
    strong = document.createElement('strong');
    statusEl.appendChild(strong);
  }
  strong.textContent = ' ' + message;
}

function addRecognized(text, lang) {
  const div = document.createElement('div');
  div.className = 'entry';
  div.innerHTML = `
    <div class="entry-meta">
      <span class="entry-lang">Heard [${lang}]</span>
      <span class="entry-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="entry-original">${text}</div>
  `;
  recognizedPane.prepend(div);
}

function addConversationEntry(record) {
  const div = document.createElement('div');
  div.className = 'entry';
  div.innerHTML = `
    <div class="entry-meta">
      <span class="entry-lang">
        ${record.fromLang.toUpperCase()} → ${record.toLang.toUpperCase()}
      </span>
      <span class="entry-time">
        ${new Date(record.timestamp).toLocaleTimeString()}
      </span>
    </div>
    <div class="entry-original">${record.original}</div>
    <div class="entry-translated">${record.translated}</div>
  `;
  convEl.prepend(div);
}

// MyMemory translation API (no key needed for demo)
async function translateText(text, fromLang, toLang) {
  const pair = `${fromLang}|${toLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text
  )}&langpair=${pair}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Translation request failed');
  }
  const data = await res.json();
  const translated =
    data.responseData && data.responseData.translatedText
      ? data.responseData.translatedText
      : null;

  if (!translated) {
    throw new Error('No translated text in API response');
  }
  return translated;
}

// Handle speech recognition lifecycle
if (recognition) {
  recognition.onstart = () => {
    accumulatedSpeech = '';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus('Listening…', { live: true });
  };

  recognition.onend = async () => {
    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (!accumulatedSpeech.trim()) {
      setStatus('Stopped. No speech detected.', { live: false });
      return;
    }

    // After mic stop, instantly translate
    handleTranslationProcess(accumulatedSpeech, 'speech');
  };

  recognition.onerror = (event) => {
    console.error(event);
    if (event.error === 'no-speech') {
      setStatus('No speech detected.', { live: false });
    } else {
      setStatus('Error: ' + event.error, { error: true, live: false });
    }
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };

  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    if (!last.isFinal) return;
    const transcript = last[0].transcript.trim();
    if (transcript) {
      accumulatedSpeech += (accumulatedSpeech ? ' ' : '') + transcript;
    }
  };
}

// Buttons

startBtn.addEventListener('click', () => {
  if (!recognition) return;
  recognition.lang = fromLangEl.value;
  recognition.start();
});

stopBtn.addEventListener('click', () => {
  if (!recognition) return;
  recognition.stop(); // onend will trigger translation
});

// Manual text translation (no mic)
// Manual text translation (no mic)
translateTextBtn.addEventListener('click', () => {
  const text = inputTextEl.value.trim();
  if (!text) {
    setStatus('Type something to translate.', { error: true, live: false });
    return;
  }
  handleTranslationProcess(text, 'text');
});

// Centralized translation handling
async function handleTranslationProcess(text, source) {
  try {
    const fromLocale = fromLangEl.value;
    const toLocale = toLangEl.value; // Now full locale like "es-ES"

    // API needs 2-letter codes (usually)
    const fromLangCode = fromLocale.split('-')[0];
    const toLangCode = toLocale.split('-')[0];

    setStatus(source === 'speech' ? 'Translating speech…' : 'Translating text…', { live: true });

    if (source === 'speech') {
      addRecognized(text, fromLocale);
    }

    // We pass 2-letter codes to MyMemory API
    const translated = await translateText(text, fromLangCode, toLangCode);

    const record = {
      fromLang: fromLangCode,
      toLang: toLangCode,
      original: text,
      translated,
      timestamp: new Date().toISOString()
    };

    conversationLog.push(record);
    outputTextEl.textContent = record.translated;
    addConversationEntry(record);
    setStatus('Done.', { live: false });
  } catch (err) {
    console.error(err);
    setStatus('Translation error: ' + err.message, { error: true, live: false });
  }
}

// Text-to-speech for translated output (using unofficial Google Translate TTS API)
listenOutputBtn.addEventListener('click', () => {
  const text = outputTextEl.textContent.trim();
  if (!text) {
    setStatus('No translated text to speak.', { error: true, live: false });
    return;
  }

  // Use the full locale from the dropdown (e.g., "es-ES", "hi-IN")
  // The API generally handles full locales well for accents.
  const targetLoc = toLangEl.value;

  // Extract 2-letter language code for Google TTS (e.g., "hi" from "hi-IN")
  const langCode = targetLoc.split('-')[0];

  // Switch to translate.google.com with client=tw-ob (often more reliable for simple requests)
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${langCode}&client=tw-ob`;

  // Create an audio element and set referrerPolicy to avoid blocking on hosted sites
  const audio = document.createElement('audio');
  audio.referrerPolicy = 'no-referrer';
  audio.src = url;

  setStatus(`Playing audio (${targetLoc})…`, { live: true });

  audio.onended = () => {
    setStatus('Done.', { live: false });
  };

  audio.onerror = (e) => {
    console.error('Audio playback error', e);
    setStatus('Error playing audio. Check network connection.', { error: true });
  };

  audio.play().catch(e => {
    console.error('Play error', e);
    setStatus('Playback failed: ' + e.message, { error: true });
  });
});