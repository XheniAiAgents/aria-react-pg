import { useState, useRef } from 'react';

export function useVoice({ API, lang = 'en', onTranscript, onError, onDebug }) {
  const [isRecording, setIsRecording]   = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const audioRef         = useRef(null);
  const streamRef        = useRef(null);
  const isRecordingRef   = useRef(false);

  const onTranscriptRef  = useRef(onTranscript);
  const onErrorRef       = useRef(onError);
  const onDebugRef       = useRef(onDebug);
  onTranscriptRef.current = onTranscript;
  onErrorRef.current      = onError;
  onDebugRef.current      = onDebug;

  const APIRef  = useRef(API);
  const langRef = useRef(lang);
  APIRef.current  = API;
  langRef.current = lang;

  // iOS audio unlock — play silent audio on first mic tap so TTS works after async fetch
  const iosAudioUnlockedRef = useRef(false);
  function unlockIOSAudio() {
    if (iosAudioUnlockedRef.current) return;
    iosAudioUnlockedRef.current = true;
    const silence = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
    silence.volume = 0;
    silence.play().catch(() => {});
  }

  function getBestMimeType() {
    // iOS Safari claims to support audio/webm via isTypeSupported() but records
    // nearly empty blobs (0-5 bytes). Force audio/mp4 on iOS Safari explicitly.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 'audio/mp4';

    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const t of candidates) {
      try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
    }
    return '';
  }

  function startRecording() {
    if (isRecordingRef.current || isProcessing) return;

    unlockIOSAudio();
    onDebugRef.current?.('🎙 requesting mic...');

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        streamRef.current = stream;
        const mimeType = getBestMimeType();
        onDebugRef.current?.(`mime: ${mimeType || 'default'}`);

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = e => {
          onDebugRef.current?.(`chunk: ${e.data.size}b`);
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.start(100);
        isRecordingRef.current = true;
        setIsRecording(true);
        onDebugRef.current?.('▶ recording...');
      })
      .catch(err => {
        console.error('[voice] mic error:', err);
        onDebugRef.current?.(`❌ mic error: ${err.message}`);
        onErrorRef.current?.('Microphone access denied. Please allow mic in browser settings.');
      });
  }

  async function stopAndTranscribe() {
    if (!isRecordingRef.current || !mediaRecorderRef.current) return;

    isRecordingRef.current = false;
    setIsRecording(false);
    setIsProcessing(true);
    onDebugRef.current?.('⏹ stopping...');

    await new Promise(resolve => {
      const recorder = mediaRecorderRef.current;
      recorder.onstop = resolve;
      // iOS Safari doesn't flush the last chunk on stop() — requestData() forces it
      recorder.requestData();
      setTimeout(() => recorder.stop(), 150);
    });

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    onDebugRef.current?.(`blob: ${blob.size}b | ${mimeType}`);

    const minSize = mimeType.includes('mp4') ? 200 : 1000;
    if (blob.size < minSize) {
      onDebugRef.current?.(`❌ blob too small (min ${minSize}b)`);
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

      onDebugRef.current?.(`📤 sending ${ext}...`);

      const res = await fetch(`${APIRef.current}/voice/transcribe`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { text } = await res.json();

      onDebugRef.current?.(`✅ text: "${text?.slice(0, 30)}"`);

      if (text?.trim()) onTranscriptRef.current?.(text.trim());
    } catch (err) {
      console.error('[voice] transcription error:', err);
      onDebugRef.current?.(`❌ transcribe error: ${err.message}`);
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
