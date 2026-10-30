// British English audio with the Web Speech API (SPEC: speechSynthesis, prefer an en-GB voice).

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

/** The chosen voice, else the best en-GB voice (enhanced/premium first), else any English voice. */
export function pickVoice(voiceURI?: string): SpeechSynthesisVoice | undefined {
  const voices = englishVoices();
  const chosen = voices.find((v) => v.voiceURI === voiceURI);
  if (chosen) return chosen;
  const gb = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === 'en-gb');
  return gb.find((v) => /enhanced|premium|natural/i.test(v.name)) ?? gb[0] ?? voices[0];
}

export function hasBritishVoice(): boolean {
  return englishVoices().some((v) => v.lang.replace('_', '-').toLowerCase() === 'en-gb');
}

export function speak(text: string, opts: { rate?: number; voiceURI?: string } = {}): void {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(opts.voiceURI);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-GB';
  u.rate = opts.rate ?? 0.9; // a little slower than the default; dictation uses 0.75
  speechSynthesis.speak(u);
}

/** Voices load asynchronously in some browsers; call once early so they are ready on first use. */
export function warmUpVoices(onReady?: () => void): void {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => onReady?.(), { once: true });
}
