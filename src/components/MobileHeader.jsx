export default function MobileHeader({ userName, mode, onModeToggle, onSettingsOpen, t }) {
  return (
    <div className="mobile-header">
      <div className="mh-logo">ARIA</div>
      <button className="mh-mode-btn" onClick={onModeToggle}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          {mode === 'work'
            ? <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>
            : <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></>
          }
        </svg>
        {mode === 'work' ? t('work') : t('dailyLife')}
      </button>
      <div className="mh-avatar" onClick={onSettingsOpen}>{userName[0]?.toUpperCase()}</div>
    </div>
  );
}
