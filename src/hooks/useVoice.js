/**
 * useVoice — handles mic recording (Groq Whisper STT) + TTS playback (ElevenLabs)
 *
 * iOS Safari fix: getUserMedia must be called synchronously inside a user
 * gesture — no await before it. We use .then() chaining instead of async/await
 * in startRecording so the gesture context is never broken.
 *
 * iOS Safari also only supports audio/mp4 for MediaRecorder, not webm.
 */

import { useState, useRef, useCallback } from 'react';

export function useVoice({ API, lang = 'en', onTranscript, onError }) {
  const [isRecording, setIsRecording]   = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const audioRef         = useRef(null);
  const streamRef        = useRef(null);

  function getBestMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const t of candidates) {
      try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
    }
    return '';
  }

  // IMPORTANT: must NOT be async and must NOT have any await before
  // getUserMedia — iOS Safari kills mic permission if the user gesture
  // context is broken by any async hop before the getUserMedia call.
  function startRecording() {
    if (isRecording || isProcessing) return;

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        streamRef.current = stream;
        const mimeType = getBestMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.start(100);
        setIsRecording(true);
      })
      .catch(err => {
        console.error('[voice] mic access denied:', err);
        onError?.('Microphone access denied. Please allow mic in browser settings.');
      });
  }

  const stopAndTranscribe = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

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

    if (blob.size < 1000) { setIsProcessing(false); return; }

    try {
      const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
                : mimeType.includes('ogg') ? 'ogg'
                : 'webm';

      const formData = new FormData();
      formData.append('audio', blob, `recording.${ext}`);
      formData.append('lang', lang);

      const res = await fetch(`${API}/voice/transcribe`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
      const { text } = await res.json();
      if (text?.trim()) onTranscript?.(text.trim());
    } catch (err) {
      console.error('[voice] transcription error:', err);
      onError?.('Could not transcribe audio. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [API, lang, onTranscript, onError]);

  const toggleMic = useCallback(() => {
    if (isRecording) {
      stopAndTranscribe();
    } else {
      startRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, stopAndTranscribe]);

  const speak = useCallback(async (text) => {
    if (!text?.trim()) return;
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
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
    } catch (err) {
      console.error('[voice] TTS error:', err);
      setIsSpeaking(false);
    }
  }, [API]);

  function stopSpeaking() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsSpeaking(false);
  }

  return { isRecording, isProcessing, isSpeaking, startRecording, stopAndTranscribe, toggleMic, speak, stopSpeaking };
}
