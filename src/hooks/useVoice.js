import { useState, useRef, useCallback } from 'react';

export function useVoice({ API, lang = 'en', onTranscript, onError }) {
  const [isRecording, setIsRecording]   = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);

  const mediaRecorderRef  = useRef(null);
  const chunksRef         = useRef([]);
  const audioRef          = useRef(null);
  const streamRef         = useRef(null);
  const isRecordingRef    = useRef(false); // always current — avoids stale closure in toggleMic

  function setRecording(val) {
    isRecordingRef.current = val;
    setIsRecording(val);
  }

  function getBestMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const t of candidates) {
      try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
    }
    return '';
  }

  // Must NOT be async — iOS Safari kills mic permission if any await
  // precedes getUserMedia inside a user gesture handler.
  function startRecording() {
    if (isRecordingRef.current || isProcessing) return;

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        streamRef.current = stream;
        const mimeType = getBestMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.start(100);
        setRecording(true);
      })
      .catch(err => {
        console.error('[voice] mic access denied:', err);
        onError?.('Microphone access denied. Please allow mic in browser settings.');
      });
  }

  async function stopAndTranscribe() {
    if (!mediaRecorderRef.current || !isRecordingRef.current) return;

    setRecording(false);
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
  }

  // Use ref so this never has a stale isRecording value
  function toggleMic() {
    if (isRecordingRef.current) {
      stopAndTranscribe();
    } else {
      startRecording();
    }
  }

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
