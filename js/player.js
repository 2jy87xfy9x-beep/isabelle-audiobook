export function splitSentences(text) {
  if (!text) return [];
  const parts = text.split(/(?<=[.!?…»])\s+(?=[A-ZÀ-Ö«"'])/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

export function buildSentenceContextMap(sentences, sortedAliases) {
  const map = new Map();
  for (let i = 0; i < sentences.length; i++) {
    const lower = sentences[i].toLowerCase();
    for (const [alias, id] of sortedAliases) {
      if (alias.length >= 4 && lower.includes(alias)) {
        map.set(i, id);
        break;
      }
    }
  }
  return map;
}

export class Player {
  constructor({ onParagraphAdvance, onWord, onEnd, onContextSnippet } = {}) {
    this.onParagraphAdvance = onParagraphAdvance || (() => {});
    this.onWord = onWord || (() => {});
    this.onEnd = onEnd || (() => {});
    this.onContextSnippet = onContextSnippet || (() => {});
    this.letterVoice = null;
    this.contextVoice = null;
    this.rate = 1;
    this.mode = 'letters';
    this.playing = false;
    this._sentences = [];
    this._sentenceIndex = 0;
    this._paragraphIndex = 0;
    this._paragraphs = [];
    this._contextDelay = 1200;
    this._spokenInParagraph = new Set();
    this._sortedAliases = [];
    this._watchdog = null;
    this._contextVerbosity = 'short';
    this._contextEntries = {};
  }

  setData({ paragraphs, sortedAliases, contextEntries }) {
    this._paragraphs = paragraphs || [];
    this._sortedAliases = sortedAliases || [];
    this._contextEntries = contextEntries || {};
  }

  setRate(r) {
    this.rate = r;
  }
  setMode(m) {
    this.mode = m;
  }
  setContextDelay(ms) {
    this._contextDelay = ms;
  }
  setContextVerbosity(v) {
    this._contextVerbosity = v;
  }

  setLetterVoice(voiceURI) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    this.letterVoice = voices.find((v) => v.voiceURI === voiceURI) || null;
  }

  setContextVoice(voiceURI) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    this.contextVoice = voices.find((v) => v.voiceURI === voiceURI) || null;
  }

  autoSelectVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    this.letterVoice = voices.find((v) => v.lang.startsWith('fr')) || voices[0] || null;
    this.contextVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
  }

  play() {
    if (this.mode === 'silent' || typeof window === 'undefined' || !window.speechSynthesis)
      return;
    this.playing = true;
    this._speakCurrentParagraph();
  }

  pause() {
    this.playing = false;
    this._clearWatchdog();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  stop() {
    this.pause();
    this._paragraphIndex = 0;
    this._sentenceIndex = 0;
  }

  skipNext() {
    this._advanceParagraph(1);
  }
  skipPrev() {
    this._advanceParagraph(-1);
  }

  setIndex(i) {
    this._paragraphIndex = i;
    this._sentenceIndex = 0;
    this._spokenInParagraph.clear();
  }

  _speakCurrentParagraph() {
    const para = this._paragraphs[this._paragraphIndex];
    if (!para) {
      this.playing = false;
      this.onEnd();
      return;
    }
    const text = para.text || para;
    this._sentences = splitSentences(text);
    this._sentenceIndex = 0;
    this._spokenInParagraph.clear();
    this._speakSentence();
  }

  _speakSentence() {
    if (!this.playing) return;
    if (this._sentenceIndex >= this._sentences.length) {
      this._advanceParagraph(1);
      return;
    }
    const sentence = this._sentences[this._sentenceIndex];
    this._speakUtterance(sentence, this.letterVoice, () => {
      if (this.mode === 'both' && this._contextVerbosity !== 'off') {
        const ctxId = this._findContextRef(sentence);
        if (ctxId && !this._spokenInParagraph.has(ctxId)) {
          this._spokenInParagraph.add(ctxId);
          setTimeout(() => this._speakContextSnippet(ctxId), this._contextDelay);
          return;
        }
      }
      this._sentenceIndex++;
      this._speakSentence();
    });
  }

  _speakContextSnippet(entryId) {
    if (!this.playing) return;
    const entry = this._contextEntries[entryId];
    if (!entry) {
      this._sentenceIndex++;
      this._speakSentence();
      return;
    }
    this.onContextSnippet(entryId);
    this._speakUtterance(entry.short || '', this.contextVoice, () => {
      setTimeout(() => {
        this._sentenceIndex++;
        this._speakSentence();
      }, this._contextDelay);
    });
  }

  _findContextRef(sentence) {
    const lower = sentence.toLowerCase();
    for (const [alias, id] of this._sortedAliases) {
      if (alias.length >= 4 && lower.includes(alias)) return id;
    }
    return null;
  }

  _speakUtterance(text, voice, onDone) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      onDone();
      return;
    }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (voice) utt.voice = voice;
    utt.rate = this.rate;
    utt.onboundary = (e) => {
      if (e.name === 'word')
        this.onWord(e.charIndex, e.charLength || 1, this._paragraphIndex);
    };
    utt.onend = () => {
      this._clearWatchdog();
      onDone();
    };
    utt.onerror = () => {
      this._clearWatchdog();
      onDone();
    };

    const watchdogMs = Math.max(5000, text.length * 80);
    this._watchdog = setTimeout(() => {
      console.warn('Player: watchdog triggered for utterance');
      window.speechSynthesis.cancel();
      onDone();
    }, watchdogMs);

    window.speechSynthesis.speak(utt);
  }

  _advanceParagraph(delta) {
    this._paragraphIndex = Math.max(
      0,
      Math.min(this._paragraphIndex + delta, this._paragraphs.length - 1)
    );
    this.onParagraphAdvance(this._paragraphIndex);
    if (this.playing && delta > 0) this._speakCurrentParagraph();
  }

  _clearWatchdog() {
    if (this._watchdog) {
      clearTimeout(this._watchdog);
      this._watchdog = null;
    }
  }
}
