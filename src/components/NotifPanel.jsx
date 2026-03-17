import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';

const NotifPanel = forwardRef(function NotifPanel({ open, onClose, isMobile = false, t }, ref) {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [permStatus, setPermStatus] = useState('default');

  useEffect(() => {
    if ('Notification' in window) setPermStatus(Notification.permission);
    else setPermStatus('denied');
  }, []);

  useEffect(() => {
    if (open) setCount(0);
  }, [open]);

  useImperativeHandle(ref, () => ({
    addItem(icon, title, sub) {
      const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      setItems(prev => [{ icon, title, sub, time }, ...prev].slice(0, 20));
      setCount(c => c + 1);
    },
    resetCount() { setCount(0); },
  }));

  async function requestPerm(e) {
    e.stopPropagation();
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    setPermStatus(Notification.permission);
  }

  function clearAll(e) {
    e.stopPropagation();
    setItems([]); setCount(0);
  }

  // Fallback text if t not provided yet
  const title = t ? t('notificationsTitle') : 'Notifications';
  const clearTxt = t ? t('clearAll') : 'clear all';
  const noNotifsTxt = t ? t('noNotifs') : 'No notifications yet.';

  const innerContent = (
    <>
      {isMobile && (
        <div style={{ fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--ghost)', paddingBottom: '10px', borderBottom: '1px solid var(--trace)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          {title}
          <button className="notif-clear" onClick={clearAll}>{clearTxt}</button>
        </div>
      )}
      {!isMobile && (
        <div className="notif-panel-title">
          {title}
          <button className="notif-clear" onClick={clearAll}>{clearTxt}</button>
        </div>
      )}
      <div className="notif-perm-row">
        <div className={`notif-perm-dot ${permStatus}`} />
        <div className="notif-perm-text">
          {permStatus === 'granted' ? 'Notifications enabled'
            : permStatus === 'denied' ? 'Blocked — allow in browser settings'
            : 'Click Enable to get reminders'}
        </div>
        {permStatus === 'default' && (
          <button className="notif-perm-btn" onClick={requestPerm}>Enable</button>
        )}
      </div>
      {!items.length
        ? <div className="notif-empty">{noNotifsTxt}</div>
        : items.map((n, i) => (
          <div key={i} className="notif-item">
            <div className="notif-icon">{n.icon}</div>
            <div className="notif-body">
              <div className="notif-body-title">{n.title}</div>
              <div className="notif-body-sub">{n.sub} · {n.time}</div>
            </div>
          </div>
        ))}
    </>
  );

  if (isMobile) {
    return (
      <div className={`mobile-notif-overlay${open ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="mobile-notif-sheet">{innerContent}</div>
      </div>
    );
  }

  return (
    <div className={`notif-panel${open ? ' open' : ''}`}>
      {innerContent}
    </div>
  );
});

export default NotifPanel;
