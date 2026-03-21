import { useState } from 'react';
import LanguageSelector from './LanguageSelector';

export default function SettingsPanel({
  API, userId, userName, userEmail,
  open, onClose,
  theme, onToggleTheme,
  onLogout, showToast,
  gmailConnected, gmailAddress,
  digestTime, digestEnabled,
  onDigestTimeChange, onDigestEnabledToggle,
  onSaveDigest, onTestDigest, onConnectGmail, onDisconnectGmail,
  calendarConnected, calendarEmail, onConnectCalendar, onDisconnectCalendar,
  lang, onSetLang,
  isMobile = false, t
}) {
  const [chpwOpen, setChpwOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [chpwErr, setChpwErr] = useState('');

  async function doChangePassword() {
    setChpwErr('');
    if (!current || !newPw || !confirm) { setChpwErr('All fields required.'); return; }
    if (newPw.length < 8) { setChpwErr('Min 8 characters.'); return; }
    if (newPw !== confirm) { setChpwErr('Passwords do not match.'); return; }
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, current_password: current, new_password: newPw })
      });
      if (!res.ok) { const e = await res.json(); setChpwErr(e.detail || 'Failed.'); return; }
      showToast('Password updated ✓');
      setCurrent(''); setNewPw(''); setConfirm(''); setChpwOpen(false); onClose();
    } catch { setChpwErr('Cannot reach ARIA server.'); }
  }

  const content = (
    <>
      {isMobile && <div className="sheet-handle" />}
      <div className="settings-profile">
        <div className="settings-name">{userName}</div>
        <div className="settings-email">{userEmail}</div>
      </div>

      {/* Change password */}
      <button className="settings-item" onClick={() => setChpwOpen(o => !o)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        {t('changePassword')}
      </button>
      <div className={`chpw-form${chpwOpen ? ' open' : ''}`}>
        <input className="chpw-input" type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} />
        <input className="chpw-input" type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} />
        <input className="chpw-input" type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} />
        <div className="chpw-err">{chpwErr}</div>
        <button className="btn-primary" style={{ width: '100%', fontSize: '10px', padding: '9px' }} onClick={doChangePassword}>Update password</button>
      </div>

      {/* Gmail digest */}
      <div className="settings-divider" />
      <div className="settings-section-label">{t('emailDigest')}</div>
      {!gmailConnected ? (
        <button className="settings-item" onClick={onConnectGmail}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          {t('connectGmail')}
        </button>
      ) : (
        <>
          <div className="digest-status connected" style={{ margin: '4px 12px 6px' }}>✓ {gmailAddress}</div>
          <div className="digest-form open" style={{ padding: '4px 12px 8px' }}>
            <div className="digest-row">
              <div className="digest-label">Send digest at</div>
              <input className="digest-input" type="time" style={{ width: '100px' }} value={digestTime} onChange={e => onDigestTimeChange(e.target.value)} />
            </div>
            <div className="digest-row">
              <div className="digest-toggle" onClick={onDigestEnabledToggle}>
                <div className={`toggle-switch${digestEnabled ? ' on' : ''}`} />
                <span>{digestEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <button className="btn-primary" style={{ flex: 1, fontSize: '10px', padding: '8px' }} onClick={onSaveDigest}>Save</button>
              <button className="btn-ghost" style={{ fontSize: '10px', padding: '8px' }} onClick={onTestDigest}>Test</button>
            </div>
            <button className="settings-item danger" style={{ padding: '6px 8px', fontSize: '10px', justifyContent: 'center', marginTop: '4px' }} onClick={onDisconnectGmail}>Disconnect Gmail</button>
          </div>
        </>
      )}

      {/* Google Calendar */}
      <div className="settings-divider" />
      <div className="settings-section-label">Google Calendar</div>
      {!calendarConnected ? (
        <button className="settings-item" onClick={onConnectCalendar}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Connect Google Calendar
        </button>
      ) : (
        <div style={{ padding: '4px 12px 8px' }}>
          <div className="digest-status connected" style={{ marginBottom: '6px' }}>✓ {calendarEmail}</div>
          <div style={{ fontSize: '10px', color: 'var(--ghost)', fontStyle: 'italic', marginBottom: '8px' }}>
            Syncs automatically when you open Calendar
          </div>
          <button className="settings-item danger" style={{ padding: '6px 8px', fontSize: '10px', justifyContent: 'center' }}
            onClick={onDisconnectCalendar}>Disconnect Calendar</button>
        </div>
      )}

      {/* Language selector */}
      <div className="settings-divider" />
      <LanguageSelector lang={lang} onSetLang={(l) => { onSetLang(l); showToast(l === 'en' ? 'Language: English' : l === 'es' ? 'Idioma: Español' : 'Gjuha: Shqip'); }} />

      {/* Theme toggle */}
      <div className="settings-divider" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--mist)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          {t('lightMode')}
        </div>
        <div className={`toggle-switch${theme === 'light' ? ' on' : ''}`} onClick={onToggleTheme} />
      </div>

      {/* Sign out */}
      <div className="settings-divider" />
      <button className="settings-item danger" onClick={onLogout}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        {t('signOut')}
      </button>
    </>
  );

  if (isMobile) {
    return (
      <div className={`mobile-settings-overlay${open ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="mobile-settings-sheet">{content}</div>
      </div>
    );
  }

  return <div className={`settings-panel${open ? ' open' : ''}`}>{content}</div>;
}
