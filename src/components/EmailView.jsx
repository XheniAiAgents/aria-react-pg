import { useState, useEffect, useRef } from 'react';
import { fmt } from '../utils/helpers';

export default function EmailView({ API, userId, lang, visible, showToast, onOpenSettings, t }) {
  const [connected, setConnected] = useState(false);
  const [emails, setEmails] = useState([]);
  const [summary, setSummary] = useState('');
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [conversation, setConversation] = useState([]);
  const [askLoading, setAskLoading] = useState(false);
  const [emailsExpanded, setEmailsExpanded] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
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
      const res = await fetch(`${API}/history/${userId}?mode=email&limit=20`);
      if (res.ok) {
        const { messages: history } = await res.json();
        if (history && history.length > 0) {
          setConversation(prev => prev.length > 0 ? prev : history.map(m => ({
            role: m.role,
            text: m.content,
            time: m.created_at ? new Date(m.created_at.replace(' ', 'T')).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
          })));
        }
      }
    } catch {}
  }

  async function loadEmailView() {
    try {
      const res = await fetch(`${API}/auth/google/status?user_id=${userId}`);
      const data = await res.json();
      setConnected(data.connected);
      if (!data.connected) return;
      setLoading(true); setSummary(''); setEmails([]);
      const r = await fetch(`${API}/email/fetch?user_id=${userId}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setSummary(`Error loading emails: ${err.detail || r.status}`);
        setLoading(false);
        return;
      }
      const json = await r.json();
      setEmails(json.emails || []); setSummary(json.summary || ''); setCount(json.count || 0);
      setLoading(false);
    } catch { setLoading(false); }
  }

  async function askAboutEmails() {
    const q = askInput.trim();
    if (!q) return;
    if (!connected) { showToast('Connect your Gmail first.', true); return; }
    setAskInput('');
    setAskLoading(true);
    const userMsg = { role: 'user', text: q, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) };
    setConversation(c => [...c, userMsg]);
    try {
      const fullQ = q;
      const { response } = await (await fetch(`${API}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullQ, user_id: userId, mode: 'email', lang })
      })).json();
      setConversation(c => [...c, { role: 'assistant', text: response, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
    } catch { showToast('Cannot reach ARIA.', true); }
    finally { setAskLoading(false); }
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
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: summaryExpanded ? 'unset' : 2,
                WebkitBoxOrient: 'vertical',
              }}>{summary}</div>
              <button onClick={() => setSummaryExpanded(e => !e)}
                style={{ background: 'none', border: 'none', color: 'var(--a2)', fontSize: '11px', cursor: 'pointer', padding: '4px 0', letterSpacing: '0.05em' }}>
                {summaryExpanded ? '▲ Less' : '▼ Read more'}
              </button>
            </div>
          )}
          {!loading && !emails.length && (
            <div style={{ fontSize: '12px', color: 'var(--ghost)', fontStyle: 'italic', padding: '8px 0' }}>No emails today.</div>
          )}
          {!loading && emails.length > 0 && (
            <>
              <button onClick={() => setEmailsExpanded(e => !e)}
                style={{ background: 'none', border: 'none', color: 'var(--a2)', fontSize: '11px', cursor: 'pointer', padding: '4px 0', textAlign: 'left', letterSpacing: '0.05em' }}>
                {emailsExpanded ? '▲ Hide emails' : `▼ Show ${emails.length} email${emails.length !== 1 ? 's' : ''}`}
              </button>
              {emailsExpanded && emails.map((e, i) => (
                <div key={i} className="email-item">
                  <div className="email-item-from">{e.from.split('<')[0].trim()}</div>
                  <div className="email-item-subject">{e.subject}</div>
                  <div className="email-item-date">{e.date}</div>
                </div>
              ))}
            </>
          )}

          {/* Email conversation */}
          {conversation.length > 0 && (
            <div ref={msgsRef} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {conversation.map((m, i) => m.role === 'user' ? (
                <div key={i} className="umsg"><div className="u-bubble">{m.text}</div></div>
              ) : (
                <div key={i} className="amsg">
                  <div className="a-orb">A</div>
                  <div>
                    <div className="a-meta">ARIA <span className="a-time">{m.time}</span></div>
                    <div className="a-bubble" dangerouslySetInnerHTML={{ __html: fmt(m.text) }} />
                  </div>
                </div>
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
  );
}
