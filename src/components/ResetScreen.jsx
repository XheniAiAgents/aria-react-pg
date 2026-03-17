import { useState } from 'react';

export default function ResetScreen({ API, resetToken, onClose, showToast }) {
  const [email, setEmail] = useState('');
  const [forgotErr, setForgotErr] = useState('');
  const [step, setStep] = useState(resetToken ? 3 : 1);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetErr, setResetErr] = useState('');

  async function doForgotPassword() {
    setForgotErr('');
    if (!email) { setForgotErr('Enter your email.'); return; }
    try {
      await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      setStep(2);
    } catch { setForgotErr('Cannot reach ARIA server.'); }
  }

  async function doResetPassword() {
    setResetErr('');
    if (newPassword.length < 8) { setResetErr('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setResetErr('Passwords do not match.'); return; }
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: newPassword })
      });
      if (!res.ok) { const e = await res.json(); setResetErr(e.detail || 'Reset failed.'); return; }
      showToast('Password updated! Sign in with your new password.');
      onClose();
    } catch { setResetErr('Cannot reach ARIA server.'); }
  }

  return (
    <div id="resetScreen" className="open">
      <div className="auth-card">
        <div className="auth-logo">ARIA</div>
        <div className="auth-sub">Password Reset</div>

        {step === 1 && (
          <div>
            <div className="auth-label">Your email</div>
            <input className="auth-input" type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doForgotPassword()} />
            <button className="auth-btn" onClick={doForgotPassword}>Send reset link</button>
            <div className="auth-err">{forgotErr}</div>
            <button className="auth-forgot" style={{ textAlign: 'center', marginTop: '12px' }} onClick={onClose}>← Back to sign in</button>
          </div>
        )}
        {step === 2 && (
          <div>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>📬</div>
            <p style={{ fontSize: '13px', color: 'var(--mist)', lineHeight: 1.7, marginBottom: '20px' }}>
              Check your inbox. We sent a reset link — it expires in 1 hour.
            </p>
            <button className="auth-btn" onClick={onClose}>Back to sign in</button>
          </div>
        )}
        {step === 3 && (
          <div>
            <div className="auth-label">New password <span style={{ fontSize: '8px', color: 'var(--ghost)' }}>(min 8 chars)</span></div>
            <input className="auth-input" type="password" placeholder="••••••••" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} />
            <div className="auth-label" style={{ marginTop: '4px' }}>Confirm password</div>
            <input className="auth-input" type="password" placeholder="••••••••" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doResetPassword()} />
            <button className="auth-btn" onClick={doResetPassword}>Set new password</button>
            <div className="auth-err">{resetErr}</div>
          </div>
        )}
      </div>
    </div>
  );
}
