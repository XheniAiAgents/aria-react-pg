import { useState, useEffect, useRef } from 'react';
import Rail from './Rail';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import ChatView from './ChatView';
import TasksView from './TasksView';
import CalendarView from './CalendarView';
import EmailView from './EmailView';
import SettingsPanel from './SettingsPanel';
import NotifPanel from './NotifPanel';
import MobileHeader from './MobileHeader';
import MobileNav from './MobileNav';
import { useReminders } from '../hooks/useReminders';
import { useGmail } from '../hooks/useGmail';

export default function AppShell({
  API, userId, userName, userEmail,
  onLogout, showToast,
  theme, toggleTheme,
  lang, setLang, t
}) {
  const [activeTab, setActiveTab] = useState('chat');
  const [mode, setMode] = useState('work');
  const [modeFlash, setModeFlash] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [mobileNotifOpen, setMobileNotifOpen] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const [memCount, setMemCount] = useState(0);
  const [rightRefreshTick, setRightRefreshTick] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  const desktopNotifRef = useRef(null);
  const mobileNotifRef = useRef(null);

  const gmail = useGmail(API, userId, showToast);

  useEffect(() => {
    gmail.loadEmailAccount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleModeChange(m) {
    if (mode === m) return;
    setMode(m);
    setModeFlash(true);
    setTimeout(() => setModeFlash(false), 300);
    const r = document.documentElement;
    if (m === 'work') {
      r.style.setProperty('--a1', '#7c6bff'); r.style.setProperty('--a2', '#a599ff');
      r.style.setProperty('--a3', 'rgba(124,107,255,0.15)');
      r.style.setProperty('--a-line', 'rgba(124,107,255,0.22)');
      r.style.setProperty('--a-glow', 'rgba(124,107,255,0.08)');
    } else {
      r.style.setProperty('--a1', '#e8a87c'); r.style.setProperty('--a2', '#f0c9a0');
      r.style.setProperty('--a3', 'rgba(232,168,124,0.15)');
      r.style.setProperty('--a-line', 'rgba(232,168,124,0.22)');
      r.style.setProperty('--a-glow', 'rgba(232,168,124,0.07)');
    }
    const ambient = document.getElementById('ambient');
    if (ambient) ambient.className = 'ambient' + (m === 'life' ? ' life' : '');
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    setRightRefreshTick(tick => tick + 1);
  }

  function handleMsgCount(updater) {
    setMsgCount(updater);
    setRightRefreshTick(tick => tick + 1);
    window.__ariaRefreshMemories && window.__ariaRefreshMemories();
  }

  function handleReminderFire(icon, title, body) {
    desktopNotifRef.current?.addItem(icon, title, body);
    mobileNotifRef.current?.addItem(icon, title, body);
    setNotifCount(c => c + 1);
  }
  useReminders(API, userId, handleReminderFire);

  // Email → chat bridge (kept for fallback)
  useEffect(() => {
    function onAskEmail(e) {
      window.__ariaPendingMessage = `[About my emails today]: ${e.detail}`;
      setActiveTab('chat');
      setTimeout(() => window.dispatchEvent(new Event('aria:send-pending')), 80);
    }
    window.addEventListener('aria:ask-email', onAskEmail);
    return () => window.removeEventListener('aria:ask-email', onAskEmail);
  }, []);

  // Click outside to close desktop settings
  useEffect(() => {
    function handleClick(e) {
      const sp = document.getElementById('desktopSettingsPanel');
      const ru = document.getElementById('railUser');
      if (settingsOpen && sp && !sp.contains(e.target) && ru && !ru.contains(e.target)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [settingsOpen]);

  const settingsProps = {
    API, userId, userName, userEmail,
    theme, onToggleTheme: toggleTheme,
    onLogout, showToast,
    gmailConnected: gmail.gmailConnected,
    gmailAddress: gmail.gmailAddress,
    digestTime: gmail.digestTime,
    digestEnabled: gmail.digestEnabled,
    onDigestTimeChange: gmail.setDigestTime,
    onDigestEnabledToggle: gmail.toggleDigestEnabled,
    onSaveDigest: gmail.saveDigest,
    onTestDigest: gmail.testDigest,
    onConnectGmail: gmail.connectGmail,
    onDisconnectGmail: gmail.disconnectGmail,
    lang, onSetLang: setLang, t,
  };

  const tabLabels = { chat: t('chat'), tasks: t('tasks'), cal: t('calendar'), email: t('email') };

  return (
    <>
      <div className={`mode-flash${modeFlash ? ' on' : ''}`} />

      <MobileHeader
        userName={userName} mode={mode}
        onModeToggle={() => handleModeChange(mode === 'work' ? 'life' : 'work')}
        onSettingsOpen={() => setMobileSettingsOpen(true)}
        t={t}
      />

      <div className="shell" id="app">
        <Rail
          activeTab={activeTab} onTabChange={handleTabChange}
          userName={userName}
          onSettingsToggle={(e) => { e.stopPropagation(); setSettingsOpen(o => !o); }}
          notifRef={desktopNotifRef} notifCount={notifCount}
          t={t}
        />

        <div id="desktopSettingsPanel" style={{ position: 'fixed', zIndex: 400 }}>
          <SettingsPanel {...settingsProps} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>

        <LeftPanel
          API={API} userId={userId} userName={userName}
          mode={mode} onModeChange={handleModeChange}
          onMemCountChange={setMemCount} t={t}
        />

        <main className="center">
          <div className="tab-bar">
            {Object.entries(tabLabels).map(([id, label]) => (
              <div key={id} id={`tab-${id}`}
                className={`tab${activeTab === id ? ' on' : ''}`}
                onClick={() => handleTabChange(id)}
              >{label}</div>
            ))}
            <div className="tab-right">
              <div className="chat-badge">ARIA · {t('personalIntelligence')}</div>
            </div>
          </div>

          <ChatView API={API} userId={userId} mode={mode} lang={lang}
            visible={activeTab === 'chat'} onMsgCount={handleMsgCount} t={t} />
          <TasksView API={API} userId={userId}
            visible={activeTab === 'tasks'} showToast={showToast} t={t} />
          <CalendarView API={API} userId={userId}
            visible={activeTab === 'cal'} showToast={showToast}
            onEventsChanged={() => setRightRefreshTick(tick => tick + 1)} t={t} />
          <EmailView API={API} userId={userId} lang={lang}
            visible={activeTab === 'email'} showToast={showToast}
            onOpenSettings={() => setSettingsOpen(true)} t={t} />
        </main>

        <RightPanel API={API} userId={userId}
          msgCount={msgCount} memCount={memCount}
          refreshTick={rightRefreshTick} t={t} />
      </div>

      <MobileNav
        activeTab={activeTab} onTabChange={handleTabChange}
        notifCount={notifCount}
        onNotifOpen={() => { setMobileNotifOpen(true); setNotifCount(0); }}
        t={t}
      />

      <NotifPanel ref={mobileNotifRef} open={mobileNotifOpen}
        onClose={() => setMobileNotifOpen(false)} isMobile />

      <SettingsPanel {...settingsProps}
        open={mobileSettingsOpen} onClose={() => setMobileSettingsOpen(false)} isMobile />
    </>
  );
}
