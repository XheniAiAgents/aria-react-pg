import { useState, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch';

export function useGmail(API, userId, showToast) {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailAddress, setGmailAddress] = useState('');
  const [digestTime, setDigestTime] = useState('08:00');
  const [digestEnabled, setDigestEnabled] = useState(false);

  const loadEmailAccount = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch('/auth/google/status');
      const data = await res.json();
      setGmailConnected(data.connected);
      if (data.connected) {
        setGmailAddress(data.gmail_address || '');
        setDigestTime(data.digest_time || '08:00');
        setDigestEnabled(!!data.digest_enabled);
      }
    } catch {}
  }, [API, userId]);

  async function connectGmail() {
    try {
      const res = await apiFetch('/auth/google/start');
      const data = await res.json();
      window.location.href = data.url;
    } catch { showToast('Cannot reach ARIA server.', true); }
  }

  async function saveDigest() {
    try {
      const res = await apiFetch(`/auth/google/digest-settings?digest_time=${digestTime}&digest_enabled=${digestEnabled}`,
        { method: 'POST' }
      );
      if (!res.ok) { showToast('Failed to save.', true); return; }
      showToast('Digest settings saved ✓');
    } catch { showToast('Cannot reach ARIA server.', true); }
  }

  async function testDigest() {
    showToast('Sending test digest…');
    try {
      const res = await apiFetch('/auth/google/test-digest', { method: 'POST' });
      if (!res.ok) { const e = await res.json(); showToast(e.detail || 'Failed.', true); return; }
      const d = await res.json();
      showToast(`Digest sent! (${d.email_count} emails summarized)`);
    } catch { showToast('Cannot reach ARIA server.', true); }
  }

  async function disconnectGmail() {
    await apiFetch('/auth/google/disconnect', { method: 'DELETE' });
    await loadEmailAccount();
    showToast('Gmail disconnected.');
  }

  function toggleDigestEnabled() {
    setDigestEnabled(e => !e);
  }

  return {
    gmailConnected, gmailAddress,
    digestTime, setDigestTime,
    digestEnabled, toggleDigestEnabled,
    loadEmailAccount,
    connectGmail, saveDigest, testDigest, disconnectGmail
  };
}
