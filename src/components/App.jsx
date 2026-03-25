import { useState, useEffect, useCallback } from 'react';
import AuthScreen from './components/AuthScreen';
import ResetScreen from './components/ResetScreen';
import AppShell from './components/AppShell';
import Toast from './components/Toast';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import { useLanguage } from './hooks/useLanguage';
import { setToken, clearToken, apiFetch } from './utils/apiFetch';
import './App.css';

const API = window.location.origin;

async function subscribeToPush(apiFetchFn) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const existingSub = await reg.pushManager.getSubscription();
    if (existingSub) await existingSub.unsubscribe();

    const res = await fetch(`${API}/push/vapid-public-key`);
    if (!res.ok) return;
    const { publicKey } = await res.json();

    const padding   = '='.repeat((4 - (publicKey.length % 4)) % 4);
    const base64    = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawKey    = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: rawKey,
    });

    const { endpoint, keys } = subscription.toJSON();
    await apiFetchFn('/push/subscribe', {
      method: 'POST',
      json: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
  } catch (e) {
    console.warn('[push] subscription failed:', e);
  }
}

export default function App() {
  const [userId, setUserId]     = useState(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [resetToken, setResetToken] = useState(null);
  const [showReset, setShowReset]   = useState(false);
  const { toast, showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t }   = useLanguage();
  const [userTimezone, setUserTimezone] = useState('Europe/Madrid');

  useEffect(() => {
    // Check for reset token in URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      fetch(`${API}/auth/verify-reset-token?token=${token}`)
        .then(r => { if (r.ok) { setResetToken(token); setShowReset(true); window.history.replaceState({}, '', '/'); } })
        .catch(() => {});
    }

    // Auto-login from localStorage
    const saved = localStorage.getItem('aria_user');
    const savedToken = localStorage.getItem('aria_token');
    if (saved && savedToken) {
      const u = JSON.parse(saved);
      setUserId(u.id);
      setUserName(u.name);
      setUserEmail(u.email || '');
      subscribeToPush(apiFetch);
      apiFetch('/user/timezone')
        .then(r => r.json())
        .then(d => { if (d.timezone) setUserTimezone(d.timezone); })
        .catch(() => {});
    }

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  const handleLogin = useCallback((user, token) => {
    setToken(token);
    setUserId(user.id);
    setUserName(user.name);
    setUserEmail(user.email || '');
    localStorage.setItem('aria_user', JSON.stringify({ id: user.id, name: user.name, email: user.email }));
    subscribeToPush(apiFetch);
  }, []);

  const handleLogout = useCallback(() => {
    clearToken();
    localStorage.removeItem('aria_user');
    setUserId(null);
    setUserName('');
    setUserEmail('');
  }, []);

  return (
    <div className={`app-root ${theme === 'light' ? 'light' : ''}`}>
      <div className="ambient" id="ambient" />
      {!userId ? (
        <AuthScreen
          API={API}
          onLogin={handleLogin}
          showToast={showToast}
          onForgot={() => setShowReset(true)}
          t={t}
        />
      ) : (
        <AppShell
          API={API}
          userId={userId}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
          showToast={showToast}
          theme={theme}
          toggleTheme={toggleTheme}
          lang={lang}
          setLang={setLang}
          t={t}
        />
      )}
      {showReset && (
        <ResetScreen
          API={API}
          resetToken={resetToken}
          onClose={() => setShowReset(false)}
          showToast={showToast}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}
