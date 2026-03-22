import { useState } from 'react';
import LanguageSelector from './LanguageSelector';

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'var(--raised)', borderRadius: '12px',
      border: '1px solid var(--trace)', overflow: 'hidden',
      marginBottom: '10px', ...style
    }}>
      {children}
    </div>
  );
}

function CardLabel({ children }) {
  return (
    <div style={{
      fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--ghost)',
      padding: '10px 14px 4px',
    }}>{children}</div>
  );
}

function CardRow({ children, onClick, danger = false, style = {} }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 14px', fontSize: '12px',
      color: danger ? 'var(--danger, #e05c5c)' : 'var(--mist)',
      cursor: onClick ? 'pointer' : 'default',
      borderTop: '1px solid var(--trace)',
      transition: 'background 0.15s',
      ...style
    }}
    onMouseEnter={e => onClick && (e.currentTarget.style.background = 'var(--w3)')}
    onMouseLeave={e => onClick && (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </div>
  );
}

function StatusBadge({ connected, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '6px 14px', fontSize: '11px',
      color: connected ? 'var(--success, #27ae60)' : 'var(--ghost)',
    }}>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: connected ? 'var(--success, #27ae60)' : 'var(--ghost)',
        flexShrink: 0,
      }} />
      {label}
    </div>
  );
}

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
  userTimezone, onSetTimezone,
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

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: '7px',
    background: 'var(--surface)', border: '1px solid var(--trace)',
    color: 'var(--mist)', fontSize: '12px', fontFamily: 'DM Sans, sans-serif',
    outline: 'none', boxSizing: 'border-box',
  };

  const content = (
    <div style={{ padding: '12px 12px 20px', overflowY: 'auto' }}>
      {isMobile && <div className="sheet-handle" />}

      {/* ACCOUNT */}
      <Card>
        <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--trace)' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'Cormorant Garamond, serif' }}>{userName}</div>
          <div style={{ fontSize: '11px', color: 'var(--ghost)', marginTop: '2px' }}>{userEmail}</div>
        </div>
        <CardRow onClick={() => setChpwOpen(o => !o)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          {t('changePassword')}
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--ghost)' }}>{chpwOpen ? '▲' : '▼'}</span>
        </CardRow>
        {chpwOpen && (
          <div style={{ padding: '8px 14px 12px', borderTop: '1px solid var(--trace)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input style={inputStyle} type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} />
            <input style={inputStyle} type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} />
            <input style={inputStyle} type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            {chpwErr && <div style={{ fontSize: '10px', color: 'var(--danger, #e05c5c)' }}>{chpwErr}</div>}
            <button className="btn-primary" style={{ fontSize: '11px', padding: '8px' }} onClick={doChangePassword}>Update password</button>
          </div>
        )}
      </Card>

      {/* INTEGRATIONS */}
      <Card>
        <CardLabel>Integrations</CardLabel>

        {/* Gmail */}
        {!gmailConnected ? (
          <CardRow onClick={onConnectGmail}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            {t('connectGmail')}
          </CardRow>
        ) : (
          <>
            <StatusBadge connected={true} label={gmailAddress} />
            <div style={{ padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ghost)' }}>
                <span>Send digest at</span>
                <input type="time" value={digestTime} onChange={e => onDigestTimeChange(e.target.value)}
                  style={{ ...inputStyle, width: '100px', padding: '4px 8px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ghost)' }}>
                <span>Email digest</span>
                <div className={`toggle-switch${digestEnabled ? ' on' : ''}`} onClick={onDigestEnabledToggle} />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-primary" style={{ flex: 1, fontSize: '10px', padding: '7px' }} onClick={onSaveDigest}>Save</button>
                <button className="btn-ghost" style={{ fontSize: '10px', padding: '7px 12px' }} onClick={onTestDigest}>Test</button>
              </div>
              <button onClick={onDisconnectGmail} style={{ background: 'none', border: 'none', fontSize: '10px', color: 'var(--danger, #e05c5c)', cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
                Disconnect Gmail
              </button>
            </div>
          </>
        )}

        {/* Google Calendar */}
        <div style={{ borderTop: '1px solid var(--trace)' }}>
          {!calendarConnected ? (
            <CardRow onClick={onConnectCalendar}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Connect Google Calendar
            </CardRow>
          ) : (
            <>
              <StatusBadge connected={true} label={calendarEmail || 'Google Calendar connected'} />
              <div style={{ padding: '0 14px 8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--ghost)', fontStyle: 'italic', marginBottom: '6px' }}>
                  Syncs automatically when you open Calendar
                </div>
                <button onClick={onDisconnectCalendar} style={{ background: 'none', border: 'none', fontSize: '10px', color: 'var(--danger, #e05c5c)', cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
                  Disconnect Calendar
                </button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* PREFERENCES */}
      <Card>
        <CardLabel>Preferences</CardLabel>

        {/* Timezone */}
        <div style={{ padding: '6px 14px 10px', borderTop: '1px solid var(--trace)' }}>
          <div style={{ fontSize: '11px', color: 'var(--ghost)', marginBottom: '5px' }}>Timezone</div>
          <select
            value={userTimezone || 'Europe/Madrid'}
            onChange={async (e) => {
              const tz = e.target.value;
              await fetch(`${API}/user/timezone?user_id=${userId}&timezone=${encodeURIComponent(tz)}`, { method: 'POST' });
              onSetTimezone && onSetTimezone(tz);
              showToast(`Timezone: ${tz}`);
            }}
            style={{ ...inputStyle }}
          >
            <optgroup label="Europe">
              <option value="Europe/Madrid">Europe/Madrid (Spain)</option>
              <option value="Europe/London">Europe/London (UK)</option>
              <option value="Europe/Paris">Europe/Paris (France)</option>
              <option value="Europe/Berlin">Europe/Berlin (Germany)</option>
              <option value="Europe/Rome">Europe/Rome (Italy)</option>
              <option value="Europe/Lisbon">Europe/Lisbon (Portugal)</option>
              <option value="Europe/Amsterdam">Europe/Amsterdam</option>
              <option value="Europe/Zurich">Europe/Zurich</option>
              <option value="Europe/Athens">Europe/Athens</option>
              <option value="Europe/Warsaw">Europe/Warsaw</option>
              <option value="Europe/Bucharest">Europe/Bucharest</option>
              <option value="Europe/Helsinki">Europe/Helsinki</option>
              <option value="Europe/Moscow">Europe/Moscow</option>
              <option value="Europe/Istanbul">Europe/Istanbul</option>
              <option value="Europe/Tirana">Europe/Tirana (Albania)</option>
            </optgroup>
            <optgroup label="Americas">
              <option value="America/New_York">America/New_York (ET)</option>
              <option value="America/Chicago">America/Chicago (CT)</option>
              <option value="America/Denver">America/Denver (MT)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
              <option value="America/Sao_Paulo">America/Sao_Paulo</option>
              <option value="America/Mexico_City">America/Mexico_City</option>
              <option value="America/Buenos_Aires">America/Buenos_Aires</option>
            </optgroup>
            <optgroup label="Asia / Pacific">
              <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
              <option value="Asia/Singapore">Asia/Singapore</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
              <option value="Asia/Shanghai">Asia/Shanghai</option>
              <option value="Asia/Kolkata">Asia/Kolkata (India)</option>
              <option value="Asia/Seoul">Asia/Seoul</option>
              <option value="Australia/Sydney">Australia/Sydney</option>
            </optgroup>
            <optgroup label="Africa / Middle East">
              <option value="Africa/Cairo">Africa/Cairo</option>
              <option value="Africa/Johannesburg">Africa/Johannesburg</option>
              <option value="Asia/Jerusalem">Asia/Jerusalem</option>
            </optgroup>
            <optgroup label="UTC">
              <option value="UTC">UTC</option>
            </optgroup>
          </select>
        </div>

        {/* Language */}
        <div style={{ padding: '6px 14px 10px', borderTop: '1px solid var(--trace)' }}>
          <div style={{ fontSize: '11px', color: 'var(--ghost)', marginBottom: '5px' }}>Language</div>
          <LanguageSelector lang={lang} onSetLang={(l) => { onSetLang(l); showToast(l === 'en' ? 'Language: English' : l === 'es' ? 'Idioma: Español' : 'Gjuha: Shqip'); }} />
        </div>

        {/* Theme */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--trace)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--mist)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            {t('lightMode')}
          </div>
          <div className={`toggle-switch${theme === 'light' ? ' on' : ''}`} onClick={onToggleTheme} />
        </div>
      </Card>

      {/* SIGN OUT */}
      <button onClick={onLogout} style={{
        width: '100%', padding: '11px', borderRadius: '10px',
        background: 'none', border: '1px solid var(--trace)',
        color: 'var(--danger, #e05c5c)', fontSize: '12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        fontFamily: 'DM Sans, sans-serif', transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(224,92,92,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        {t('signOut')}
      </button>
    </div>
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
