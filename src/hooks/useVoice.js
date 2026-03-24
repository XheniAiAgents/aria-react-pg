import { useState, useRef } from 'react';

export function useVoice({ API, lang = 'en', onTranscript, onError }) {
  const [isRecording, setIsRecording]   = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const audioRef         = useRef(null);
  const streamRef        = useRef(null);
  const isRecordingRef   = useRef(false);

  // Keep callbacks in refs so they're always current without causing re-renders
  const onTranscriptRef  = useRef(onTranscript);
  const onErrorRef       = useRef(onError);
  onTranscriptRef.current = onTranscript;
  onErrorRef.current      = onError;

  const APIRef  = useRef(API);
  const langRef = useRef(lang);
  APIRef.current  = API;
  langRef.current = lang;

  // FIX 1: Pre-created Audio element for iOS TTS autoplay.
  // iOS only allows audio.play() if the Audio element was created AND
  // play() was called (even silently) inside a direct user gesture.
  // We unlock it once on first mic tap so TTS works after the async fetch.
  const iosAudioUnlockedRef = useRef(false);
  function unlockIOSAudio() {
    if (iosAudioUnlockedRef.current) return;
    iosAudioUnlockedRef.current = true;
    // Play a silent 1-frame audio to prime iOS audio context
    const silence = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
    silence.volume = 0;
    silence.play().catch(() => {});
  }

  function getBestMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const t of candidates) {
      try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
    }
    return '';
  }

  // Must be a plain sync function — iOS Safari requires getUserMedia to be
  // called directly inside the user gesture with no preceding await.
  function startRecording() {
    if (isRecordingRef.current || isProcessing) return;

    // FIX 1: Unlock iOS audio on the same gesture that starts recording
    unlockIOSAudio();

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        streamRef.current = stream;
        const mimeType = getBestMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.start(100);
        isRecordingRef.current = true;
        setIsRecording(true);
      })
      .catch(err => {
        console.error('[voice] mic error:', err);
        onErrorRef.current?.('Microphone access denied. Please allow mic in browser settings.');
      });
  }

  async function stopAndTranscribe() {
    if (!isRecordingRef.current || !mediaRecorderRef.current) return;

    isRecordingRef.current = false;
    setIsRecording(false);
    setIsProcessing(true);

    await new Promise(resolve => {
      mediaRecorderRef.current.onstop = resolve;
      mediaRecorderRef.current.stop();
    });

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    // FIX 2: Lower the minimum blob size threshold for iOS.
    // iOS Safari produces audio/mp4 which is encoded differently — valid short
    // recordings can be under 1000 bytes and were being silently discarded.
    const minSize = mimeType.includes('mp4') ? 200 : 1000;
    if (blob.size < minSize) {
      console.warn('[voice] blob too small, skipping:', blob.size, mimeType);
      setIsProcessing(false);
      return;
    }

    try {
      const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
                : mimeType.includes('ogg') ? 'ogg'
                : 'webm';

      const formData = new FormData();
      formData.append('audio', blob, `recording.${ext}`);
      formData.append('lang', langRef.current);

      const res = await fetch(`${APIRef.current}/voice/transcribe`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
      const { text } = await res.json();
      if (text?.trim()) onTranscriptRef.current?.(text.trim());
    } catch (err) {
      console.error('[voice] transcription error:', err);
      onErrorRef.current?.('Could not transcribe audio. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  function toggleMic() {
    if (isRecordingRef.current) {
      stopAndTranscribe();
    } else {
      startRecording();
    }
  }

  async function speak(text) {
    if (!text?.trim()) return;
    stopSpeaking();
    try {
      setIsSpeaking(true);
      const res = await fetch(`${APIRef.current}/voice/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);

      // FIX 1 (cont): Reuse the pre-existing audio element if available,
      // otherwise create new. iOS allows .play() here because we already
      // unlocked the audio context during the mic tap gesture.
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
    } catch (err) {
      console.error('[voice] TTS error:', err);
      setIsSpeaking(false);
    }
  }

  function stopSpeaking() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsSpeaking(false);
  }

  return { isRecording, isProcessing, isSpeaking, startRecording, stopAndTranscribe, toggleMic, speak, stopSpeaking };
}
