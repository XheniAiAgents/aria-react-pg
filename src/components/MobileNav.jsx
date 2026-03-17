export default function MobileNav({ activeTab, onTabChange, notifCount, onNotifOpen, t }) {
  const tabs = [
    { id: 'chat', key: 'chat', icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></> },
    { id: 'tasks', key: 'tasks', icon: <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></> },
    { id: 'cal', key: 'calendar', icon: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
    { id: 'email', key: 'email', icon: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></> },
  ];

  return (
    <nav className="mobile-nav">
      <div className="mn-items">
        {tabs.map(tab => (
          <div key={tab.id} id={`mn-${tab.id}`} className={`mn-item${activeTab === tab.id ? ' on' : ''}`} onClick={() => onTabChange(tab.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{tab.icon}</svg>
            <span className="mn-label">{t(tab.key)}</span>
          </div>
        ))}
        <div className="mn-item" id="mn-bell" onClick={onNotifOpen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span className="mn-label">{t('alerts')}</span>
          <div className={`mn-badge${notifCount > 0 ? ' visible' : ''}` }>{notifCount > 99 ? '99+' : notifCount}</div>
        </div>
      </div>
    </nav>
  );
}
