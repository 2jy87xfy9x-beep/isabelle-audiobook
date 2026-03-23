// js/player.js
// Web Speech API controller.

export class Player {
  constructor({ onAdvance, onWord }) {
    this.onAdvance = onAdvance; // called with (newIndex) when a paragraph ends
    this.onWord = onWord;       // called with (wordStart, wordLength, el) — best-effort
    this.currentIndex = 0;
    this.totalParagraphs = 0;
    this.paragraphs = [];       // raw paragraph objects from book.json
    this.rate = 1;
    this.voice = null;
    this.playing = false;
    this._populateVoices();
  }

  _populateVoices() {
    const populate = () => {
      this._voices = window.speechSynthesis.getVoices();
    };
    populate();
    window.speechSynthesis.addEventListener('voiceschanged', populate);
  }

  getVoices() {
    return this._voices || [];
  }

  setVoice(voiceURI) {
    this.voice = this.getVoices().find(v => v.voiceURI === voiceURI) || null;
  }

  setRate(rate) {
    this.rate = rate;
  }

  setData(paragraphs, startIndex = 0) {
    this.paragraphs = paragraphs;
    this.totalParagraphs = paragraphs.length;
    this.currentIndex = startIndex;
  }

  setIndex(index) {
    this.currentIndex = Math.max(0, Math.min(index, Math.max(0, this.totalParagraphs - 1)));
  }

  play() {
    if (!window.speechSynthesis) return;
    this.playing = true;
    this._speakCurrent();
  }

  _speakCurrent() {
    if (!this.playing) return;
    if (this.currentIndex >= this.totalParagraphs) { this.playing = false; return; }

    window.speechSynthesis.cancel();

    const para = this.paragraphs[this.currentIndex];
    const utterance = new SpeechSynthesisUtterance(para.text);
    utterance.rate = this.rate;
    if (this.voice) utterance.voice = this.voice;

    utterance.onboundary = (e) => {
      if (e.name === 'word') {
        this.onWord?.(e.charIndex, e.charLength, this.currentIndex);
      }
    };

    utterance.onend = () => {
      if (!this.playing) return;
      const next = this.currentIndex + 1;
      if (next < this.totalParagraphs) {
        this.currentIndex = next;
        this.onAdvance(next);
        this._speakCurrent();
      } else {
        this.playing = false;
        this.onAdvance(this.currentIndex);
      }
    };

    utterance.onerror = (e) => {
      // 'interrupted' fires when cancel() is called intentionally — ignore it
      if (e.error === 'interrupted') return;
      console.warn('Speech error:', e.error);
    };

    window.speechSynthesis.speak(utterance);
  }

  pause() {
    this.playing = false;
    window.speechSynthesis.cancel();
  }

  stop() {
    this.playing = false;
    this.currentIndex = 0;
    window.speechSynthesis.cancel();
  }

  skipNext() {
    window.speechSynthesis.cancel();
    this.currentIndex = Math.min(this.currentIndex + 1, this.totalParagraphs - 1);
    this.onAdvance(this.currentIndex);
    if (this.playing) this._speakCurrent();
  }

  skipPrev() {
    window.speechSynthesis.cancel();
    this.currentIndex = Math.max(this.currentIndex - 1, 0);
    this.onAdvance(this.currentIndex);
    if (this.playing) this._speakCurrent();
  }
}
