import { useState, useRef, useEffect, useCallback } from 'react';
import { fmt } from '../utils/helpers';

export default function ChatView({ API, userId, mode, lang, onMsgCount, visible, t }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null); // { file, preview, type }
  const msgsRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const initializedRef = useRef(false);

  const scrollDown = useCallback(() => {
    setTimeout(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, 50);
  }, []);

  useEffect(() => { scrollDown(); }, [messages, scrollDown]);

  // Welcome message
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const h = new Date().getHours();
    const g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const name = JSON.parse(localStorage.getItem('aria_user') || '{}').name || '';
    const work = [`${g}, ${name}.\n\nWhat are we working on today?`, `${g}, ${name}. Ready when you are.\n\nWhat needs your attention first?`];
    const life = [`${g}, ${name} 🌿\n\n¿Qué tal? What's on your mind?`, `${g}, ${name}.\n\nHere whenever you need me.`];
    const pool = mode === 'work' ? work : life;
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    setMessages([{ type: 'aria', text: pool[Math.floor(Math.random() * pool.length)], time }]);
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
    // Reset input so same file can be selected again
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

    // Add user message to UI
    setMessages(msgs => [...msgs, {
      type: 'user',
      text: text || (currentFile ? `[${currentFile.file.name}]` : ''),
      file: currentFile ? { name: currentFile.file.name, type: currentFile.type, preview: currentFile.preview } : null
    }]);
    setMessages(msgs => [...msgs, { type: 'typing' }]);

    try {
      let response;

      if (currentFile) {
        // Send as multipart form with file
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
        // Normal text chat
        const data = await (await fetch(`${API}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, user_id: userId, mode, lang })
        })).json();
        response = data.response;
      }

      const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      setMessages(msgs => [...msgs.filter(m => m.type !== 'typing'), { type: 'aria', text: response, time }]);
      onMsgCount(c => c + 1);
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
              <div className="a-orb">A</div>
              <div className="t-bubble"><div className="td"/><div className="td"/><div className="td"/></div>
            </div>
          );
          return (
            <div key={i} className="amsg">
              <div className="a-orb">A</div>
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

        {/* File attachment preview */}
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
          {/* File attach button */}
          <button
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            disabled={isThinking}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
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
          <button className="send-btn" onClick={send} disabled={isThinking || (!input.trim() && !attachedFile)}>
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div className="input-hint">{t ? t('send') : '↵ send · shift+↵ newline'}</div>
      </div>
    </div>
  );
}
