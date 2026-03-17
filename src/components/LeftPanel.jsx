import { useState, useEffect, useCallback } from 'react';
import { fmtDate, formatProfileDate } from '../utils/helpers';

export default function LeftPanel({ API, userId, userName, mode, onModeChange, onMemCountChange, t }) {
  const [memories, setMemories] = useState([]);
  const [showLinkCode, setShowLinkCode] = useState(false);
  const [linkCode, setLinkCode] = useState('——————');

  const loadMemories = useCallback(async () => {
    try {
      const { memories: mems } = await (await fetch(`${API}/memories/${userId}`)).json();
      setMemories(mems || []);
      onMemCountChange && onMemCountChange(mems?.length || 0);
    } catch {}
  }, [API, userId, onMemCountChange]);

  useEffect(() => {
    loadMemories();
    window.__ariaRefreshMemories = loadMemories;
    return () => { delete window.__ariaRefreshMemories; };
  }, [loadMemories]);

  async function delMem(id) {
    await fetch(`${API}/memories/${id}?user_id=${userId}`, { method: 'DELETE' });
    loadMemories();
  }

  async function generateLinkCode() {
    try {
      const res = await fetch(`${API}/link/generate?user_id=${userId}`, { method: 'POST' });
      const { code } = await res.json();
      setLinkCode(code); setShowLinkCode(true);
      setTimeout(() => setShowLinkCode(false), 600000);
    } catch {}
  }

  return (
    <aside className="left">
      <div className="profile-card">
        <div className="profile-top">
          <div className="avatar-wrap">
            <div className="avatar-ring" />
            <div className="avatar">{userName[0]?.toUpperCase()}</div>
          </div>
          <div>
            <div className="profile-name">{userName}</div>
            <div className="profile-sub">{t('personalIntelligence')}</div>
          </div>
        </div>
        <div className="profile-date">{formatProfileDate()}</div>
        <div className="mode-switch">
          <button className={`mode-btn${mode === 'work' ? ' work-on' : ''}`} onClick={() => onModeChange('work')}>{t('work')}</button>
          <button className={`mode-btn${mode === 'life' ? ' life-on' : ''}`} onClick={() => onModeChange('life')}>{t('dailyLife')}</button>
        </div>
        {!showLinkCode ? (
          <button className="tg-link-btn" onClick={generateLinkCode}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
            {t('connectTelegram')}
          </button>
        ) : (
          <div className="link-code-box">
            <div className="link-code-label">Your code — expires in 10 min</div>
            <div className="link-code-display">{linkCode}</div>
            <div className="link-code-hint">Send <span>/link CODE</span> to your bot</div>
          </div>
        )}
      </div>
      <div className="ctx-wrap">
        <div className="ctx-label">{t('ariaKnows')}</div>
        {!memories.length ? (
          <div style={{ fontSize: '11px', color: 'var(--ghost)', fontStyle: 'italic' }}>{t('startChatting')}</div>
        ) : memories.map(m => (
          <div key={m.id} className={`know-card ${m.importance}`}>
            <div className="know-text">{m.content}</div>
            <div className="know-foot">
              <span className="know-date">{fmtDate(m.created_at)}</span>
              <button className="know-del" onClick={() => delMem(m.id)}>forget</button>
            </div>
          </div>
        ))}
      </div>
      <div className="status-bar">
        <div className="pulse-dot" />
        <div className="status-txt">{t('online')} · {mode === 'work' ? t('work') : t('dailyLife')}</div>
      </div>
    </aside>
  );
}
