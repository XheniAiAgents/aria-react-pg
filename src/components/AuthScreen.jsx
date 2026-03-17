import { useState } from 'react';

export default function AuthScreen({ API, onLogin, showToast, onForgot, t }) {
  const [tab, setTab] = useState('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regErr, setRegErr] = useState('');

  async function doEmailLogin() {
    setLoginErr('');
    if (!loginEmail || !loginPassword) { setLoginErr('Email and password required.'); return; }
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      if (!res.ok) { const e = await res.json(); setLoginErr(e.detail || 'Invalid credentials.'); return; }
      const { user } = await res.json();
      onLogin(user);
    } catch { setLoginErr('Cannot reach ARIA server.'); }
  }

  async function doRegister() {
    setRegErr('');
    if (!regName || !regEmail || !regPassword) { setRegErr('All fields required.'); return; }
    if (regPassword.length < 8) { setRegErr('Password must be at least 8 characters.'); return; }
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, email: regEmail, password: regPassword })
      });
      if (!res.ok) { const e = await res.json(); setRegErr(e.detail || 'Registration failed.'); return; }
      const { user } = await res.json();
      onLogin(user);
    } catch { setRegErr('Cannot reach ARIA server.'); }
  }

  const signIn = t ? t('signIn') : 'Sign in';
  const createAccount = t ? t('createAccount') : 'Create account';
  const forgotPassword = t ? t('forgotPassword') : 'Forgot password?';

  return (
    <div id="authScreen">
      <div className="auth-card">
        <div className="auth-logo">ARIA</div>
        <div className="auth-sub">Personal Intelligence</div>
        <div className="auth-tabs">
          <button className={`auth-tab${tab === 'login' ? ' on' : ''}`} onClick={() => setTab('login')}>{signIn}</button>
          <button className={`auth-tab${tab === 'register' ? ' on' : ''}`} onClick={() => setTab('register')}>{createAccount}</button>
        </div>

        {/* Login */}
        <div className={`auth-form${tab === 'login' ? ' on' : ''}`}>
          <div className="auth-label">Email</div>
          <input className="auth-input" type="email" placeholder="you@example.com"
            value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doEmailLogin()} />
          <div className="auth-label">Password</div>
          <button className="auth-forgot" onClick={onForgot}>{forgotPassword}</button>
          <input className="auth-input" type="password" placeholder="••••••••"
            value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doEmailLogin()} />
          <button className="auth-btn" onClick={doEmailLogin}>{signIn}</button>
          <div className="auth-err">{loginErr}</div>
        </div>

        {/* Register */}
        <div className={`auth-form${tab === 'register' ? ' on' : ''}`}>
          <div className="auth-label">Your name</div>
          <input className="auth-input" type="text" placeholder="Jane"
            value={regName} onChange={e => setRegName(e.target.value)} />
          <div className="auth-label">Email</div>
          <input className="auth-input" type="email" placeholder="you@example.com"
            value={regEmail} onChange={e => setRegEmail(e.target.value)} />
          <div className="auth-label">
            Password <span style={{ fontSize: '8px', color: 'var(--ghost)', letterSpacing: '0.1em' }}>(min 8 chars)</span>
          </div>
          <input className="auth-input" type="password" placeholder="••••••••"
            value={regPassword} onChange={e => setRegPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doRegister()} />
          <button className="auth-btn" onClick={doRegister}>{createAccount}</button>
          <div className="auth-err">{regErr}</div>
        </div>
      </div>
    </div>
  );
}
