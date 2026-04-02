import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { fmt } from '../utils/helpers';

const inputStyle = {
  background: 'var(--input-bg, rgba(255,255,255,0.08))',
  border: '1px solid var(--input-border, rgba(255,255,255,0.15))',
  borderRadius: '8px', padding: '8px 12px',
  color: 'var(--input-color, #ffffff)',
  fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const sendBtnStyle = {
  background: 'var(--a2,#a599ff)', color: '#000', border: 'none', borderRadius: '8px',
  padding: '8px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
  letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px',
};
const cancelBtnStyle = {
  background: 'transparent', color: 'var(--ghost,#666)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
  padding: '8px 14px', fontSize: '12px', cursor: 'pointer', letterSpacing: '0.04em',
};

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolBtn({ execCmd, cmd, value, title, labelColor, children }) {
  return (
    <button onMouseDown={e => { e.preventDefault(); execCmd(cmd, value); }} title={title} style={{
      background: 'none', border: 'none', color: labelColor, cursor: 'pointer',
      padding: '4px 6px', borderRadius: '4px', fontSize: '13px', lineHeight: 1,
      display: 'flex', alignItems: 'center',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(165,153,255,0.15)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >{children}</button>
  );
}

// ── Strip markdown meta text, keep only the actual email draft ──────────────────
function extractEmailDraft(text) {
  if (!text) return '';
  // Remove common ARIA meta lines before/after the draft
  const lines = text.split('\n');
  let start = 0;
  let end = lines.length;
  // Find where the actual email starts (greeting line)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^(hi |hey |dear |hello |good |subject:|re:)/i.test(l)) {
      start = i;
      break;
    }
  }
  // Find where it ends (after sign-off, before meta lines)
  for (let i = lines.length - 1; i >= start; i--) {
    const l = lines[i].trim();
    if (l && !/^(---|\*\*|😊|😄|🎉|copy and paste|just copy|ready to send|hope this|let me know|anything else|feel free)/i.test(l)) {
      end = i + 1;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

// ── Floating Email Composer with Rich Text ────────────────────────────────────
function EmailComposer({ draft, onSent, onCancel, onReplied, showToast }) {
  const [to, setTo] = useState(draft.to || '');
  const [subject, setSubject] = useState(draft.subject || '');
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [savedBody, setSavedBody] = useState(draft.body || '');
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && draft.body) {
      editorRef.current.innerHTML = draft.body;
      setSavedBody(draft.body);
    }
    setTo(draft.to || '');
    setSubject(draft.subject || '');
    // Register global file handler
    window.__ariaAddAttachments = (files) => {
      setAttachments(prev => [...prev, ...files]);
    };
    return () => { delete window.__ariaAddAttachments; };
  }, [draft]);

  // Restore editor content when unminimizing
  useEffect(() => {
    if (!minimized && editorRef.current) {
      editorRef.current.innerHTML = savedBody;
    }
  }, [minimized]);

  const isDark = !document.querySelector('.app-root')?.classList.contains('light');
  const bg = isDark ? '#1e1b2e' : '#ffffff';
  const textColor = isDark ? '#e8e6ff' : '#1a1a2e';
  const labelColor = isDark ? '#888' : '#666';
  const borderColor = isDark ? 'rgba(165,153,255,0.3)' : 'rgba(165,153,255,0.4)';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#f5f5ff';
  const inputBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(165,153,255,0.3)';
  const toolbarBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(165,153,255,0.06)';

  const fieldStyle = {
    background: inputBg, border: `1px solid ${inputBorder}`,
    borderRadius: '8px', padding: '8px 12px', color: textColor,
    fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  function execCmd(cmd, value = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  async function handleSend() {
    if (!to.trim()) { showToast('Add a recipient email.', true); return; }
    if (!subject.trim()) { showToast('Add a subject.', true); return; }
    const htmlBody = editorRef.current?.innerHTML || '';
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('to', to.trim());
      formData.append('subject', subject.trim());
      formData.append('body', htmlBody);
      if (draft.thread_id) formData.append('thread_id', draft.thread_id);
      if (draft.in_reply_to) formData.append('in_reply_to', draft.in_reply_to);
      attachments.forEach(f => formData.append('files', f));
      const res = await apiFetch('/email/send', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.status);
      }
      showToast('✓ Email sent!');
      if (draft.thread_id) onReplied?.(draft.thread_id);
      onSent();
    } catch (e) {
      showToast(`Error: ${e.message}`, true);
    } finally {
      setSending(false);
    }
  }

  function handleFileChange(e) {
    setAttachments(prev => [...prev, ...Array.from(e.target.files)]);
    e.target.value = '';
  }

  const ToolBtn = ({ cmd, value, title, children }) => (
    <button onMouseDown={e => { e.preventDefault(); execCmd(cmd, value); }} title={title} style={{
      background: 'none', border: 'none', color: labelColor, cursor: 'pointer',
      padding: '4px 6px', borderRadius: '4px', fontSize: '13px', lineHeight: 1,
      display: 'flex', alignItems: 'center',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(165,153,255,0.15)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >{children}</button>
  );

  const isMobile = window.innerWidth < 600;

  const desktopStyle = maximized ? {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh', zIndex: 1000, borderRadius: '0',
  } : {
    position: 'fixed', bottom: '24px', right: '24px', width: '460px', maxWidth: 'calc(100vw - 48px)', zIndex: 1000, borderRadius: '12px',
  };

  const mobileStyle = {
    position: 'fixed', bottom: '60px', left: '0', right: '0',
    height: '85vh', zIndex: 1000, borderRadius: '16px 16px 0 0',
  };

  const composerStyle = isMobile ? mobileStyle : desktopStyle;

  // ── Mobile bottom sheet layout ──
  if (isMobile) {
    return (
      <div style={{
        ...mobileStyle, background: bg, border: `1px solid ${borderColor}`,
        boxShadow: '0 -4px 30px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Drag pill */}
        <div style={{ width: '40px', height: '4px', background: 'rgba(165,153,255,0.4)', borderRadius: '2px', margin: '10px auto 0', flexShrink: 0 }} />
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', flexShrink: 0 }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: textColor }}>{subject || 'New Email'}</span>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '20px', padding: '0' }}>✕</button>
        </div>
        {/* To / Subject */}
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${inputBorder}`, paddingBottom: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', color: labelColor, fontWeight: 600, minWidth: '60px' }}>TO</span>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com"
              style={{ background: 'none', border: 'none', outline: 'none', color: textColor, fontSize: '14px', width: '100%' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${inputBorder}`, paddingBottom: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: labelColor, fontWeight: 600, minWidth: '60px' }}>SUBJECT</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
              style={{ background: 'none', border: 'none', outline: 'none', color: textColor, fontSize: '14px', width: '100%' }} />
          </div>
        </div>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '4px 10px', background: toolbarBg, borderBottom: `1px solid ${inputBorder}`, flexWrap: 'wrap', flexShrink: 0 }}>
          <ToolBtn cmd="bold" title="Bold"><b style={{fontSize:'14px'}}>B</b></ToolBtn>
          <ToolBtn cmd="italic" title="Italic"><i style={{fontSize:'14px'}}>I</i></ToolBtn>
          <ToolBtn cmd="underline" title="Underline"><u style={{fontSize:'14px'}}>U</u></ToolBtn>
          <ToolBtn cmd="strikeThrough" title="Strikethrough"><s style={{fontSize:'13px'}}>S</s></ToolBtn>
          <div style={{ width:'1px', height:'18px', background: inputBorder, margin:'0 4px' }}/>
          <ToolBtn cmd="insertUnorderedList" title="Bullets">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
              <circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/>
            </svg>
          </ToolBtn>
          <ToolBtn cmd="insertOrderedList" title="Numbers">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
              <path d="M4 6h1v4M4 10h2" strokeLinecap="round"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" strokeLinecap="round"/>
            </svg>
          </ToolBtn>
          <div style={{ width:'1px', height:'18px', background: inputBorder, margin:'0 4px' }}/>
          <ToolBtn cmd="undo" title="Undo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.45"/>
            </svg>
          </ToolBtn>
          <ToolBtn cmd="redo" title="Redo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.45"/>
            </svg>
          </ToolBtn>
        </div>
        {/* Editor */}
        <div ref={editorRef} contentEditable suppressContentEditableWarning
          onInput={() => setSavedBody(editorRef.current?.innerHTML || '')}
          style={{ flex: 1, padding: '14px 16px', color: textColor, fontSize: '15px', lineHeight: '1.7', outline: 'none', overflowY: 'auto' }}
        />
        {/* Attachments */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 16px 8px', flexShrink: 0 }}>
            {attachments.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(165,153,255,0.1)', border: '1px solid rgba(165,153,255,0.2)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--a2,#a599ff)' }}>
                📎 {f.name}
                <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '14px', padding: '0', lineHeight: 1 }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {/* Footer — always visible */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${inputBorder}`, flexShrink: 0, paddingBottom: '20px' }}>
          <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTimeout(() => document.getElementById('aria-global-file-input').click(), 0); }}
            style={{ background: 'none', border: 'none', color: labelColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            Attach
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            {draft.thread_id && (
              <button onClick={() => window.open(`https://mail.google.com/mail/#all/${draft.thread_id}`, '_blank')}
                style={{ background: 'transparent', color: 'var(--a2,#a599ff)', border: '1px solid rgba(165,153,255,0.3)', borderRadius: '10px', padding: '10px 18px', fontSize: '14px', cursor: 'pointer' }}>
                Gmail
              </button>
            )}
            <button onClick={handleSend} disabled={sending}
              style={{ background: 'var(--a2,#a599ff)', color: '#000', border: 'none', borderRadius: '10px', padding: '10px 24px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {sending ? (
                <>
                  <span style={{ width:'12px', height:'12px', borderRadius:'50%', border:'2px solid rgba(0,0,0,0.3)', borderTopColor:'#000', display:'inline-block', animation:'spin 0.6s linear infinite' }}/>
                  Sending…
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop floating window layout ──
  return (
    <div style={{
      ...desktopStyle, background: bg, border: `1px solid ${borderColor}`,
      boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column', transition: 'all 0.2s ease',
    }}>
      {/* Header */}
      <div onClick={() => !maximized && setMinimized(m => !m)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: 'rgba(165,153,255,0.12)',
        cursor: maximized ? 'default' : 'pointer', userSelect: 'none', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--a2,#a599ff)" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 600, color: textColor }}>{subject || 'New Email'}</span>
        </div>
        <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
          {!maximized && (
            <button onClick={() => setMinimized(m => !m)}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '14px', padding: '2px 6px', borderRadius: '4px' }}>
              {minimized ? '▲' : '▼'}
            </button>
          )}
          <button onClick={() => { setMaximized(m => !m); setMinimized(false); }}
            style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
            {maximized ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            )}
          </button>
          <button onClick={onCancel}
            style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '16px', padding: '2px 6px', borderRadius: '4px' }}>✕</button>
        </div>
      </div>

      {!minimized && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* To / Subject */}
          <div style={{ padding: '10px 14px 0', display: 'flex', flexDirection: 'column', gap: '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${inputBorder}`, paddingBottom: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', color: labelColor, fontWeight: 600, minWidth: '55px' }}>TO</span>
              <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com"
                style={{ background: 'none', border: 'none', outline: 'none', color: textColor, fontSize: '13px', width: '100%' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${inputBorder}`, paddingBottom: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: labelColor, fontWeight: 600, minWidth: '55px' }}>SUBJECT</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
                style={{ background: 'none', border: 'none', outline: 'none', color: textColor, fontSize: '13px', width: '100%' }} />
            </div>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '4px 10px', background: toolbarBg, borderBottom: `1px solid ${inputBorder}`, flexWrap: 'wrap' }}>
            <ToolBtn cmd="bold" title="Bold"><b style={{fontSize:'13px'}}>B</b></ToolBtn>
            <ToolBtn cmd="italic" title="Italic"><i style={{fontSize:'13px'}}>I</i></ToolBtn>
            <ToolBtn cmd="underline" title="Underline"><u style={{fontSize:'13px'}}>U</u></ToolBtn>
            <ToolBtn cmd="strikeThrough" title="Strikethrough"><s style={{fontSize:'12px'}}>S</s></ToolBtn>
            <div style={{ width:'1px', height:'16px', background: inputBorder, margin:'0 3px' }}/>
            <ToolBtn cmd="insertUnorderedList" title="Bullet list">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
                <circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/>
              </svg>
            </ToolBtn>
            <ToolBtn cmd="insertOrderedList" title="Numbered list">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
                <path d="M4 6h1v4M4 10h2" strokeLinecap="round"/>
                <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" strokeLinecap="round"/>
              </svg>
            </ToolBtn>
            <div style={{ width:'1px', height:'16px', background: inputBorder, margin:'0 3px' }}/>
            <ToolBtn cmd="justifyLeft" title="Align left">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
              </svg>
            </ToolBtn>
            <ToolBtn cmd="justifyCenter" title="Center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
              </svg>
            </ToolBtn>
            <ToolBtn cmd="justifyRight" title="Align right">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
              </svg>
            </ToolBtn>
            <div style={{ width:'1px', height:'16px', background: inputBorder, margin:'0 3px' }}/>
            <ToolBtn cmd="undo" title="Undo">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.45"/>
              </svg>
            </ToolBtn>
            <ToolBtn cmd="redo" title="Redo">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.45"/>
              </svg>
            </ToolBtn>
          </div>

          {/* Editor area */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => setSavedBody(editorRef.current?.innerHTML || '')}
            style={{
              flex: 1, padding: '12px 14px', color: textColor,
              fontSize: '13px', lineHeight: '1.6', outline: 'none',
              overflowY: 'auto',
              minHeight: maximized ? '200px' : '160px',
              maxHeight: maximized ? 'unset' : '220px',
            }}
          />

          {/* Attachments */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 14px 8px' }}>
              {attachments.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'rgba(165,153,255,0.1)', border: '1px solid rgba(165,153,255,0.2)',
                  borderRadius: '6px', padding: '3px 8px', fontSize: '11px', color: 'var(--a2,#a599ff)',
                }}>
                  📎 {f.name}
                  <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '12px', padding: '0', lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${inputBorder}`, flexShrink: 0 }}>
            <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTimeout(() => document.getElementById('aria-global-file-input').click(), 0); }}
              style={{ background: 'none', border: 'none', color: labelColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              Attach
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              {draft.thread_id && (
                <button onClick={() => window.open(`https://mail.google.com/mail/#all/${draft.thread_id}`, '_blank')}
                  style={{ background: 'transparent', color: 'var(--a2,#a599ff)', border: '1px solid rgba(165,153,255,0.3)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Gmail
                </button>
              )}
              <button onClick={handleSend} disabled={sending}
                style={{ background: 'var(--a2,#a599ff)', color: '#000', border: 'none', borderRadius: '8px', padding: '7px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {sending ? (
                  <>
                    <span style={{ width:'10px', height:'10px', borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', display:'inline-block', animation:'spin 0.6s linear infinite' }}/>
                    Sending…
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Email Picker ──────────────────────────────────────────────────────────────
function EmailPicker({ emails, onSelect, repliedIds }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {emails.map((email, i) => (
        <div key={i} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px', padding: '10px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fg,#e8e6ff)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email.from.split('<')[0].trim()}
              </span>
              {repliedIds.has(email.thread_id) || repliedIds.has(email.id) ? (
                <span style={{ fontSize: '10px', background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '4px', padding: '1px 6px', fontWeight: 600, flexShrink: 0 }}>
                  Replied ✓
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ghost,#999)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject}</div>
          </div>
          <button onClick={() => onSelect(email)} style={{
            background: 'rgba(165,153,255,0.12)', border: '1px solid rgba(165,153,255,0.3)',
            borderRadius: '6px', padding: '5px 10px', color: 'var(--a2,#a599ff)',
            fontSize: '10px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}>
            ↩ Reply
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Assistant bubble ──────────────────────────────────────────────────────────
function AssistantBubble({ msg, onCompose, isReplyContext }) {
  return (
    <div className="amsg">
      <div className="a-orb">A</div>
      <div style={{ flex: 1 }}>
        <div className="a-meta">ARIA <span className="a-time">{msg.time}</span></div>
        <div className="a-bubble" dangerouslySetInnerHTML={{ __html: fmt(msg.text) }} />
        {isReplyContext && (
          <button onClick={() => {
            // Preserve line breaks when passing to composer
            const bodyHtml = (msg.text || '').replace(/\n/g, '<br>');
            onCompose(bodyHtml);
          }} style={{
            marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(165,153,255,0.12)', border: '1px solid rgba(165,153,255,0.3)',
            borderRadius: '8px', padding: '6px 12px', color: 'var(--a2,#a599ff)',
            fontSize: '11px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Edit this email
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main EmailView ─────────────────────────────────────────────────────────────
export default function EmailView({ API, userId, lang, visible, showToast, onOpenSettings, t }) {
  const [connected, setConnected] = useState(false);
  const [emails, setEmails] = useState([]);
  const [summary, setSummary] = useState('');
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [conversation, setConversation] = useState([]);
  const [askLoading, setAskLoading] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [composerDraft, setComposerDraft] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [repliedIds, setRepliedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('aria_replied_ids') || '[]')); }
    catch { return new Set(); }
  });
  const msgsRef = useRef(null);
  const historyLoadedRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem('aria_replied_ids', JSON.stringify([...repliedIds])); }
    catch {}
  }, [repliedIds]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [conversation]);

  useEffect(() => {
    if (visible) {
      loadEmailView();
      if (!historyLoadedRef.current) {
        historyLoadedRef.current = true;
        loadHistory();
      }
    }
  }, [visible]);

  async function loadHistory() {
    try {
      const res = await apiFetch('/history/me?mode=email&limit=20');
      if (res.ok) {
        const { messages: history } = await res.json();
        if (history && history.length > 0) {
          setConversation(prev => prev.length > 0 ? prev : history.map(m => ({
            role: m.role, text: m.content,
            time: m.created_at ? new Date(m.created_at.replace(' ', 'T')).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
          })));
        }
      }
    } catch {}
  }

  async function loadEmailView() {
    try {
      const res = await apiFetch('/auth/google/status');
      const data = await res.json();
      setConnected(data.connected);
      if (!data.connected) return;
      setLoading(true); setSummary(''); setEmails([]);
      const r = await apiFetch('/email/fetch');
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setSummary(`Error loading emails: ${err.detail || r.status}`);
        setLoading(false); return;
      }
      const json = await r.json();
      setEmails(json.emails || []); setSummary(json.summary || ''); setCount(json.count || 0);
      setLoading(false);
    } catch { setLoading(false); }
  }

  async function handleEmailSelected(email) {
    setShowPicker(false);
    setSelectedEmail(email);
    setAskLoading(true);
    const prompt = `Draft a reply for this email:\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.body}`;
    setConversation(c => [...c, {
      role: 'user', text: `↩ Reply to: "${email.subject}"`,
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    }]);
    try {
      const { response } = await (await apiFetch('/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, mode: 'email', lang }),
      })).json();
      setConversation(c => [...c, {
        role: 'assistant', text: response, isReply: true,
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      }]);
      // Auto-open composer with first draft — preserve line breaks
      const replyToRaw = email.reply_to || email.from || '';
      const toAddr = replyToRaw.match(/<(.+)>/)?.[1] || replyToRaw.trim();
      // Convert markdown to HTML preserving line breaks
      const bodyHtml = extractEmailDraft(response).replace(/\n/g, '<br>');
      setComposerDraft({
        to: toAddr,
        subject: email.subject ? `Re: ${email.subject}` : '',
        body: bodyHtml,
        thread_id: email.thread_id || null,
        in_reply_to: email.message_id || null,
      });
    } catch {
      showToast('Cannot reach ARIA.', true);
    } finally {
      setAskLoading(false);
    }
  }

  async function askAboutEmails() {
    const q = askInput.trim();
    if (!q) return;
    if (!connected) { showToast('Connect your Gmail first.', true); return; }
    setAskInput('');
    setAskLoading(true);

    // Fix 1: if in reply mode, send ONLY the selected email as context — not the full inbox
    const message = selectedEmail
      ? `${q}\n\n[Replying to this email - From: ${selectedEmail.from}, Subject: "${selectedEmail.subject}":\n${selectedEmail.body}]`
      : q;

    // Only skip composer update for very short casual messages (1-3 words)
    const isCasual = selectedEmail && q.trim().split(/\s+/).length <= 3 && 
      /^(thanks|ok|great|good|perfect|nice|cool|yes|no|sure|got it|sounds good|thank you|gracias|perfecto|vale|genial)$/i.test(q.trim());

    setConversation(c => [...c, {
      role: 'user', text: q,
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    }]);
    try {
      const { response } = await (await apiFetch('/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, mode: 'email', lang })
      })).json();
      setConversation(c => [...c, {
        role: 'assistant', text: response, isReply: !!selectedEmail && !isCasual,
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      }]);

      // Update composer whenever in reply mode and not a casual message
      if (selectedEmail && !isCasual) {
        const replyToRaw = selectedEmail.reply_to || selectedEmail.from || '';
        const toAddr = replyToRaw.match(/<(.+)>/)?.[1] || replyToRaw.trim();
        const subj = selectedEmail.subject ? `Re: ${selectedEmail.subject}` : '';
        const bodyHtml = extractEmailDraft(response).replace(/\n/g, '<br>');
        setComposerDraft({
          to: toAddr, subject: subj, body: bodyHtml,
          thread_id: selectedEmail.thread_id || null,
          in_reply_to: selectedEmail.message_id || null,
        });
      }
    } catch {
      showToast('Cannot reach ARIA.', true);
    } finally {
      setAskLoading(false);
    }
  }

  function openComposer(body) {
    // Use Reply-To if available, otherwise From
    const replyToRaw = selectedEmail?.reply_to || selectedEmail?.from || '';
    const toAddr = replyToRaw.match(/<(.+)>/)?.[1] || replyToRaw.trim();
    const subj = selectedEmail?.subject ? `Re: ${selectedEmail.subject}` : '';
    setComposerDraft({
      to: toAddr, subject: subj, body,
      thread_id: selectedEmail?.thread_id || null,
      in_reply_to: selectedEmail?.message_id || null,
    });
  }

  return (
    <>
      <div id="emailView" style={{ display: visible ? 'flex' : 'none', flexDirection: 'column', overflowY: 'auto', padding: '24px 32px' }}>
        <div className="email-header">
          <div className="email-title">{t('email')}</div>
          {connected && (
            <button className="add-btn" onClick={loadEmailView}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Refresh
            </button>
          )}
        </div>

        {!connected ? (
          <div className="email-not-connected">
            <div className="email-not-connected-icon">📭</div>
            <div className="email-not-connected-text">
              You haven't linked your Gmail account yet.<br /><br />
              Go to <a onClick={onOpenSettings} style={{ cursor: 'pointer' }}>settings</a> and click <strong>{t('connectGmail')}</strong>.
            </div>
          </div>
        ) : (
          <>
            {loading && (
              <div className="email-loading">
                <div className="td"/><div className="td"/><div className="td"/>
                <span>ARIA is reading your emails…</span>
              </div>
            )}
            {!loading && summary && (
              <div className="email-summary-card">
                <div className="email-summary-label">
                  <span>AI Summary</span>
                  <span style={{ color: 'var(--a2)' }}>{count} email{count !== 1 ? 's' : ''} today</span>
                </div>
                <div className="email-summary-text" style={{
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: summaryExpanded ? 'unset' : 2, WebkitBoxOrient: 'vertical',
                }}>{summary}</div>
                <button onClick={() => setSummaryExpanded(e => !e)}
                  style={{ background: 'none', border: 'none', color: 'var(--a2)', fontSize: '11px', cursor: 'pointer', padding: '4px 0', letterSpacing: '0.05em' }}>
                  {summaryExpanded ? '▲ Less' : '▼ Read more'}
                </button>
              </div>
            )}

            {/* Today's inbox */}
            {!loading && emails.length > 0 && (
              <div style={{ marginTop: '14px' }}>
                <button onClick={() => setShowPicker(p => !p)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  color: 'var(--a2,#a599ff)', fontSize: '11px', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 0 8px 0',
                }}>
                  <span>{showPicker ? '▲' : '▼'}</span>
                  Today's inbox
                  <span style={{ color: 'var(--ghost,#666)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>({emails.length})</span>
                </button>
                {showPicker && (
                  <EmailPicker emails={emails} onSelect={handleEmailSelected} repliedIds={repliedIds} />
                )}
              </div>
            )}

            {/* Conversation */}
            {conversation.length > 0 && (
              <div ref={msgsRef} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                {conversation.map((m, i) => m.role === 'user' ? (
                  <div key={i} className="umsg"><div className="u-bubble">{m.text}</div></div>
                ) : (
                  <AssistantBubble key={i} msg={m} isReplyContext={m.isReply} onCompose={openComposer} />
                ))}
                {askLoading && (
                  <div className="typing">
                    <div className="a-orb">A</div>
                    <div className="t-bubble"><div className="td"/><div className="td"/><div className="td"/></div>
                  </div>
                )}
              </div>
            )}
            {!conversation.length && askLoading && (
              <div className="email-loading" style={{ marginTop: '16px' }}>
                <div className="td"/><div className="td"/><div className="td"/>
                <span>ARIA is thinking…</span>
              </div>
            )}

            <div className="email-ask-bar">
              <input className="email-ask-input" placeholder={t('askAria')} value={askInput}
                onChange={e => setAskInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && askAboutEmails()} />
              <button className="send-btn" onClick={askAboutEmails} style={{ width: '32px', height: '32px' }}>
                <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Global file input — outside fixed/overflow contexts */}
      {composerDraft && (
        <input
          id="aria-global-file-input"
          type="file"
          multiple
          style={{ display: 'none', position: 'fixed', top: 0, left: 0, zIndex: 9999 }}
          onChange={e => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) {
              window.__ariaAddAttachments?.(files);
            }
            e.target.value = '';
          }}
        />
      )}

      {/* Floating composer */}
      {composerDraft && (
        <EmailComposer
          draft={composerDraft}
          showToast={showToast}
          onReplied={(threadId) => setRepliedIds(prev => {
            const next = new Set(prev);
            if (threadId) next.add(threadId);
            if (selectedEmail?.id) next.add(selectedEmail.id);
            return next;
          })}
          onSent={() => setComposerDraft(null)}
          onCancel={() => setComposerDraft(null)}
        />
      )}
    </>
  );
}
