/**
 * useVoice — handles mic recording (Groq Whisper STT) + TTS playback (ElevenLabs)
 *
 * Modes:
 *   - holdToTalk: record while mouse/touch held down, send on release
 *   - toggleMic:  click to start, click again to stop & send
 *
 * Usage:
 *   const voice = useVoice({ API, lang, onTranscript, onError });
 *
 *   // Hold-to-talk handlers (attach to a button):
 *   onPointerDown={voice.startRecording}
 *   onPointerUp={voice.stopAndTranscribe}
 *   onPointerLeave={voice.stopAndTranscribe}
 *
 *   // Toggle mic:
 *   onClick={voice.toggleMic}
 *
 *   // TTS (play ARIA response):
 *   voice.speak(text)
 *   voice.stopSpeaking()
 *
 *   // State:
 *   voice.isRecording  — mic is active
 *   voice.isProcessing — waiting for Whisper
 *   voice.isSpeaking   — ElevenLabs audio is playing
 */

import { useState, useRef, useCallback } from 'react';

export function useVoice({ API, lang = 'en', onTranscript, onError }) {
  const [isRecording, setIsRecording]   = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const audioRef         = useRef(null);   // HTMLAudioElement for TTS playback
  const streamRef        = useRef(null);   // MediaStream to stop tracks

  // ── Recording helpers ────────────────────────────────────────────────────

  async function startRecording() {
    if (isRecording || isProcessing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm/opus (Chrome/Firefox), fallback to whatever is supported
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100); // collect in 100ms chunks
      setIsRecording(true);
    } catch (err) {
      console.error('[voice] mic access denied:', err);
      onError?.('Microphone access denied. Please allow mic in browser settings.');
    }
  }

  const stopAndTranscribe = useCallback(async () => {
    if (!isRecording || !mediaRecorderRef.current) return;

    setIsRecording(false);
    setIsProcessing(true);

    // Stop recorder and collect final chunk
    await new Promise(resolve => {
      mediaRecorderRef.current.onstop = resolve;
      mediaRecorderRef.current.stop();
    });

    // Stop mic stream
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    if (blob.size < 1000) {
      // Too short — likely silence
      setIsProcessing(false);
      return;
    }

    try {
      const ext = mimeType.includes('mp4') ? 'm4a'
                : mimeType.includes('ogg') ? 'ogg'
                : 'webm';

      const formData = new FormData();
      formData.append('audio', blob, `recording.${ext}`);
      formData.append('lang', lang);

      const res = await fetch(`${API}/voice/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
      const { text } = await res.json();

      if (text?.trim()) {
        onTranscript?.(text.trim());
      }
    } catch (err) {
      console.error('[voice] transcription error:', err);
      onError?.('Could not transcribe audio. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [isRecording, API, lang, onTranscript, onError]);

  // ── Toggle mic mode ───────────────────────────────────────────────────────

  const toggleMic = useCallback(async () => {
    if (isRecording) {
      await stopAndTranscribe();
    } else {
      await startRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, stopAndTranscribe]);

  // ── TTS: ElevenLabs ───────────────────────────────────────────────────────

  const speak = useCallback(async (text) => {
    if (!text?.trim()) return;

    // Stop any ongoing speech
    stopSpeaking();

    try {
      setIsSpeaking(true);

      const res = await fetch(`${API}/voice/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error(`TTS failed: ${res.status}`);

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      console.error('[voice] TTS error:', err);
      setIsSpeaking(false);
      // Don't surface TTS errors to user — silent fallback is fine
    }
  }, [API]);

  function stopSpeaking() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }

  return {
    // State
    isRecording,
    isProcessing,
    isSpeaking,
    // Hold-to-talk
    startRecording,
    stopAndTranscribe,
    // Toggle
    toggleMic,
    // TTS
    speak,
    stopSpeaking,
  };
}
