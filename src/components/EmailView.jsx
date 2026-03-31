import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { fmt } from '../utils/helpers';

// ── Email Composer ────────────────────────────────────────────────────────────
function EmailComposer({ draft, onSent, onCancel, onReplied, showToast }) {
  const [to, setTo] = useState(draft.to || '');
  const [subject, setSubject] = useState(draft.subject || '');
  const [body, setBody] = useState(draft.body || '');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!to.trim()) { showToast('Add a recipient email.', true); return; }
    if (!subject.trim()) { showToast('Add a subject.', true); return; }
    setSending(true);
    try {
      const res = await apiFetch('/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body,
          thread_id: draft.thread_id || null,
          in_reply_to: draft.in_reply_to || null,
        }),
      });
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

  return (
    <div style={{
      marginTop: '12px', background: 'var(--card, rgba(255,255,255,0.04))',
      border: '1px solid rgba(165,153,255,0.2)', borderRadius: '12px',
      padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--a2,#a599ff)" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--a2,#a599ff)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>New Email</span>
        </div>
        <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '4px 7px', borderRadius: '6px' }}>✕</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '10px', color: 'var(--ghost,#666)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>To</label>
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '10px', color: 'var(--ghost,#666)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Subject</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '10px', color: 'var(--ghost,#666)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Message</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
        <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
        {draft.thread_id && (
          <button onClick={() => window.open(`https://mail.google.com/mail/#all/${draft.thread_id}`, '_blank')} style={{ ...cancelBtnStyle, color: 'var(--a2,#a599ff)', borderColor: 'rgba(165,153,255,0.3)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Send from Gmail
            </span>
          </button>
        )}
        <button onClick={handleSend} disabled={sending} style={sendBtnStyle}>
          {sending ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.6s linear infinite' }}/>
              Sending…
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              Send
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Email Picker ──────────────────────────────────────────────────────────────
function EmailPicker({ emails, onSelect, onCancel, repliedIds, hideCancel }) {
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
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button onClick={() => onSelect(email)} style={{
              background: 'rgba(165,153,255,0.12)', border: '1px solid rgba(165,153,255,0.3)',
              borderRadius: '6px', padding: '5px 10px', color: 'var(--a2,#a599ff)',
              fontSize: '10px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em', whiteSpace: 'nowrap',
            }}>
              ↩ Reply
            </button>

          </div>
        </div>
      ))}
      {!hideCancel && <button onClick={onCancel} style={{ ...cancelBtnStyle, alignSelf: 'flex-end', marginTop: '4px' }}>Cancel</button>}
    </div>
  );
}

const inputStyle = {
  background: '#ffffff', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px', padding: '8px 12px', color: '#000000',
  fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const sendBtnStyle = {
  background: 'var(--a2,#a599ff)', color: '#000', border: 'none', borderRadius: '8px',
  padding: '8px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
  letterSpacing: '0.04em', display: 'flex', alignItems: 'center',
};
const cancelBtnStyle = {
  background: 'transparent', color: 'var(--ghost,#666)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
  padding: '8px 14px', fontSize: '12px', cursor: 'pointer', letterSpacing: '0.04em',
};

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
            // Strip HTML tags to get plain text for the composer
            const tmp = document.createElement('div');
            tmp.innerHTML = fmt(msg.text || '');
            onCompose(tmp.innerText || msg.text || '');
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

  // Persist repliedIds on change
  useEffect(() => {
    try { localStorage.setItem('aria_replied_ids', JSON.stringify([...repliedIds])); }
    catch {}
  }, [repliedIds]);
  const msgsRef = useRef(null);
  const historyLoadedRef = useRef(false);

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
      role: 'user',
      text: `↩ Reply to: "${email.subject}"`,
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
    // If we have a selected email, include it as context for follow-up questions
    const message = selectedEmail
      ? `${q}\n\n[Context - email from ${selectedEmail.from}, subject: "${selectedEmail.subject}"]`
      : q;
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
        role: 'assistant', text: response, isReply: !!selectedEmail,
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      }]);
    } catch {
      showToast('Cannot reach ARIA.', true);
    } finally {
      setAskLoading(false);
    }
  }

  function openComposer(body) {
    const fromRaw = selectedEmail?.from || '';
    const toAddr = fromRaw.match(/<(.+)>/)?.[1] || fromRaw;
    const subj = selectedEmail?.subject ? `Re: ${selectedEmail.subject}` : '';
    setComposerDraft({
      to: toAddr,
      subject: subj,
      body,
      thread_id: selectedEmail?.thread_id || null,
      in_reply_to: selectedEmail?.message_id || null,
    });
    setShowPicker(false);
  }

  return (
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
                <EmailPicker emails={emails} onSelect={handleEmailSelected} onCancel={() => {}} repliedIds={repliedIds} hideCancel />
              )}
            </div>
          )}

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
  );
}
