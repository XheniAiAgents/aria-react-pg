import { useState, useRef, useEffect, useCallback } from 'react';
import { fmt } from '../utils/helpers';
import { useVoice } from '../hooks/useVoice';

export default function ChatView({ API, userId, mode, lang, onMsgCount, visible, t }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null); // { file, preview, type }
  const [voiceMode, setVoiceMode] = useState(false);      // TTS auto-read toggle
  const msgsRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const initializedRef = useRef(false);

  const voice = useVoice({
    API,
    lang,
    onTranscript: (text) => {
      setInput(text);
      // Auto-send after voice transcription
      setTimeout(() => doSend(text), 100);
    },
    onError: (msg) => {
      // Show brief error in chat
      setMessages(msgs => [...msgs, { type: 'aria', text: `⚠️ ${msg}`, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
    },
  });

  const scrollDown = useCallback(() => {
    setTimeout(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, 50);
  }, []);

  const isFirstLoad = useRef(true);

  useEffect(() => { 
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      // Still scroll to bottom on first load so user sees latest messages
      setTimeout(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, 100);
      return;
    }
    scrollDown(); 
  }, [messages, scrollDown]);

  // Load history or show welcome message
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    function getWelcome() {
      const h = new Date().getHours();
      const g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
      const name = JSON.parse(localStorage.getItem('aria_user') || '{}').name || '';
      const work = [`${g}, ${name}.\n\nWhat are we working on today?`, `${g}, ${name}. Ready when you are.\n\nWhat needs your attention first?`];
      const life = [`${g}, ${name} 🌿\n\n¿Qué tal? What\'s on your mind?`, `${g}, ${name}.\n\nHere whenever you need me.`];
      const pool = mode === 'work' ? work : life;
      const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return { type: 'aria', text: pool[Math.floor(Math.random() * pool.length)], time };
    }

    function isNewSession(lastMsgDate) {
      if (!lastMsgDate) return true;
      const last = new Date(lastMsgDate.replace(' ', 'T').replace('+00', 'Z'));
      const now = new Date();
      const differentDay = last.toDateString() !== now.toDateString();
      const afterSevenAm = now.getHours() >= 7;
      const hoursElapsed = (now - last) / (1000 * 60 * 60);
      return (differentDay && afterSevenAm) || hoursElapsed >= 8;
    }

    async function loadHistory() {
      try {
        const res = await fetch(`${API}/history/${userId}?mode=${mode}&limit=30`);
        if (res.ok) {
          const { messages: history } = await res.json();
          if (history && history.length > 0) {
            const loaded = history.map(m => ({
              type: m.role === 'user' ? 'user' : 'aria',
              text: m.content,
              time: new Date(m.created_at.replace(' ', 'T').replace('+00', 'Z')).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              created_at: m.created_at
            }));
            const lastMsg = history[history.length - 1];
            if (isNewSession(lastMsg?.created_at)) {
              setMessages([...loaded, getWelcome()]);
            } else {
              setMessages(loaded);
              scrollDown();
            }
            return;
          }
        }
      } catch {}
      setMessages([getWelcome()]);
    }

    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Email bridge
  useEffect(() => {
    async function onSendPending() {
      const msg = window.__ariaPendingMessage;
      if (!msg) return;
      delete window.__ariaPendingMessage;
      await doSend(msg);
    }
    window.addEventListener('aria:send-pending', onSendPending);
    return () => window.removeEventListener('aria:send-pending', onSendPending);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode, lang]);

  // ── FILE HANDLING ─────────────────────────────────────────────────────────

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    if (isImage) {
      const reader = new FileReader();
      reader.onload = ev => setAttachedFile({ file, preview: ev.target.result, type: 'image' });
      reader.readAsDataURL(file);
    } else {
      setAttachedFile({ file, preview: null, type: 'document' });
    }
    e.target.value = '';
  }

  function removeAttachment() {
    setAttachedFile(null);
  }

  // ── SEND ─────────────────────────────────────────────────────────────────

  async function doSend(text) {
    if ((!text.trim() && !attachedFile) || isThinking) return;
    const currentFile = attachedFile;
    setAttachedFile(null);
    setIsThinking(true);

    setMessages(msgs => [...msgs, {
      type: 'user',
      text: text || (currentFile ? `[${currentFile.file.name}]` : ''),
      file: currentFile ? { name: currentFile.file.name, type: currentFile.type, preview: currentFile.preview } : null
    }]);
    setMessages(msgs => [...msgs, { type: 'typing' }]);

    try {
      let response;

      if (currentFile) {
        const formData = new FormData();
        formData.append('user_id', userId);
        formData.append('mode', mode);
        formData.append('lang', lang);
        formData.append('message', text || '');
        formData.append('file', currentFile.file);
        const res = await fetch(`${API}/chat/file`, { method: 'POST', body: formData });
        const data = await res.json();
        response = data.response;
      } else {
        // Build local time string from browser (not UTC)
        const d = new Date();
        const localTime = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
        const data = await (await fetch(`${API}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, user_id: userId, mode, lang, user_local_time: localTime })
        })).json();
        response = data.response;
      }

      const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      setMessages(msgs => [...msgs.filter(m => m.type !== 'typing'), { type: 'aria', text: response, time }]);
      onMsgCount(c => c + 1);
      // Auto-read ARIA response if voice mode is on
      if (voiceMode) voice.speak(response);
    } catch {
      setMessages(msgs => msgs.filter(m => m.type !== 'typing'));
    } finally {
      setIsThinking(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text && !attachedFile) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await doSend(text);
  }

  const getDateDivider = () => {
    const now = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${t ? t('today') : 'Today'} · ${now.getDate()} ${months[now.getMonth()]}`;
  };

  return (
    <div id="chatView" style={{ display: visible ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      <div className="msgs" ref={msgsRef}>
        <div className="divider">{getDateDivider()}</div>
        {messages.map((msg, i) => {
          if (msg.type === 'user') return (
            <div key={i} className="umsg">
              <div className="u-bubble">
                {msg.file && (
                  <div className="file-preview-sent">
                    {msg.file.preview
                      ? <img src={msg.file.preview} alt={msg.file.name} style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '8px', display: 'block', marginBottom: msg.text ? '8px' : 0 }} />
                      : <div className="file-chip-sent">📄 {msg.file.name}</div>
                    }
                  </div>
                )}
                {msg.text && msg.text}
              </div>
            </div>
          );
          if (msg.type === 'typing') return (
            <div key={i} className="typing">
              <div className="a-orb"><img src="/aria-avatar.png" alt="ARIA" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}}/></div>
              <div className="t-bubble"><div className="td"/><div className="td"/><div className="td"/></div>
            </div>
          );
          return (
            <div key={i} className="amsg">
              <div className="a-orb"><img src="/aria-avatar.png" alt="ARIA" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}}/></div>
              <div>
                <div className="a-meta">ARIA <span className="a-time">{msg.time}</span></div>
                <div className="a-bubble" dangerouslySetInnerHTML={{ __html: fmt(msg.text) }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="input-zone">
        <div className="input-shimmer" />

        {attachedFile && (
          <div className="file-preview-bar">
            {attachedFile.preview
              ? <img src={attachedFile.preview} alt="preview" style={{ height: '48px', borderRadius: '6px', objectFit: 'cover' }} />
              : <div className="file-chip">📄 {attachedFile.file.name}</div>
            }
            <button className="file-remove-btn" onClick={removeAttachment} title="Remove">✕</button>
          </div>
        )}

        <div className="input-row">
          <button
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            disabled={isThinking}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.jpg,.jpeg,.png,.gif,.webp"
            onChange={handleFileSelect}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,90)+'px'; }}
            onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} }}
            placeholder={t ? t('talkToAria') : 'Talk to ARIA…'}
            rows={1}
          />

          {/* ── Smart mic / send button ── */}
          {input.trim() || attachedFile ? (
            <button className="send-btn" onClick={send} disabled={isThinking} title="Send">
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          ) : (
            <button
              className={`send-btn mic-btn${voice.isRecording ? ' recording' : ''}${voice.isProcessing ? ' processing' : ''}`}
              onClick={voice.toggleMic}
              disabled={isThinking}
              title={voice.isRecording ? 'Tap to stop' : 'Tap to talk'}
            >
              {voice.isProcessing ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10" style={{ animation: 'spin 1s linear infinite', transformOrigin: 'center' }}/>
                </svg>
              ) : voice.isRecording ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                  <rect x="4" y="4" width="16" height="16" rx="3"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <rect x="9" y="2" width="6" height="12" rx="3"/>
                  <path d="M5 10a7 7 0 0 0 14 0"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              )}
            </button>
          )}


        </div>
        <div className="input-hint">{t ? t('send') : '↵ send · shift+↵ newline'}</div>
      </div>
    </div>
  );
}
