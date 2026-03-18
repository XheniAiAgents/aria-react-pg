import { useState } from 'react';
import NotifPanel from './NotifPanel';

export default function Rail({ activeTab, onTabChange, userName, onSettingsToggle, notifRef, notifCount, t }) {
  const [notifOpen, setNotifOpen] = useState(false);

  function toggleNotif(e) {
    e.stopPropagation();
    if (!notifOpen && notifRef.current) notifRef.current.resetCount();
    setNotifOpen(o => !o);
  }

  return (
    <nav className="rail">
      <div className="rail-logo">A</div>

      <button id="ri-chat" className={`ri${activeTab === 'chat' ? ' on' : ''}`} onClick={() => onTabChange('chat')} title={t('chat')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <button id="ri-tasks" className={`ri${activeTab === 'tasks' ? ' on' : ''}`} onClick={() => onTabChange('tasks')} title="Organise">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="8" y1="9" x2="16" y2="9"/>
          <line x1="8" y1="13" x2="14" y2="13"/>
        </svg>
      </button>

      <button id="ri-cal" className={`ri${activeTab === 'cal' ? ' on' : ''}`} onClick={() => onTabChange('cal')} title={t('calendar')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>

      <button id="ri-email" className={`ri${activeTab === 'email' ? ' on' : ''}`} onClick={() => onTabChange('email')} title={t('email')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      </button>

      <div className="rail-spacer" />

      <div style={{ position: 'relative' }}>
        <button id="riBell" className="ri ri-bell" onClick={toggleNotif} title={t('alerts')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <div className={`bell-badge${notifCount > 0 ? ' visible' : ''}`}>
            {notifCount > 99 ? '99+' : notifCount}
          </div>
        </button>
        <NotifPanel ref={notifRef} open={notifOpen} onClose={() => setNotifOpen(false)} t={t} />
      </div>

      <div style={{ height: '8px' }} />
      <div id="railUser" className="rail-user" onClick={onSettingsToggle} title="Settings">
        {userName[0]?.toUpperCase()}
      </div>
    </nav>
  );
}
