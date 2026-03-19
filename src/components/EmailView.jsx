import { useState, useEffect } from 'react';
import { fmt } from '../utils/helpers';

export default function EmailView({ API, userId, lang, visible, showToast, onOpenSettings, t }) {
  const [connected, setConnected] = useState(false);
  const [emails, setEmails] = useState([]);
  const [summary, setSummary] = useState('');
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [askResponse, setAskResponse] = useState('');
  const [askLoading, setAskLoading] = useState(false);

  useEffect(() => { if (visible) loadEmailView(); }, [visible]);

  async function loadEmailView() {
    try {
      const res = await fetch(`${API}/auth/google/status?user_id=${userId}`);
      const data = await res.json();
      setConnected(data.connected);
      if (!data.connected) return;
      setLoading(true); setSummary(''); setEmails(''); setAskResponse('');
      const r = await fetch(`${API}/email/fetch?user_id=${userId}`);
      if (!r.ok) { setLoading(false); return; }
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
    setAskResponse('');
    setAskLoading(true);
    try {
      const fullQ = `[About my emails today]: ${q}`;
      const { response } = await (await fetch(`${API}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullQ, user_id: userId, mode: 'email', lang })
      })).json();
      setAskResponse(response);
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
              <div className="email-summary-text">{summary}</div>
            </div>
          )}
          {!loading && !emails.length && (
            <div style={{ fontSize: '12px', color: 'var(--ghost)', fontStyle: 'italic', padding: '8px 0' }}>No emails today.</div>
          )}
          {!loading && emails.map && emails.map((e, i) => (
            <div key={i} className="email-item">
              <div className="email-item-from">{e.from.split('<')[0].trim()}</div>
              <div className="email-item-subject">{e.subject}</div>
              <div className="email-item-date">{e.date}</div>
            </div>
          ))}

          {/* Inline ARIA response — stays in email view */}
          {askLoading && (
            <div className="email-loading" style={{ marginTop: '16px' }}>
              <div className="td"/><div className="td"/><div className="td"/>
              <span>ARIA is thinking…</span>
            </div>
          )}
          {askResponse && !askLoading && (
            <div style={{ marginTop: '16px', padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--a-line)', borderRadius: '12px', fontSize: '13px', lineHeight: 1.8, color: 'var(--mist)', whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{ __html: fmt(askResponse) }}
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
