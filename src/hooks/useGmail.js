import { useState, useCallback } from 'react';

export function useGmail(API, userId, showToast) {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailAddress, setGmailAddress] = useState('');
  const [digestTime, setDigestTime] = useState('08:00');
  const [digestEnabled, setDigestEnabled] = useState(false);

  const loadEmailAccount = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API}/auth/google/status?user_id=${userId}`);
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
      const res = await fetch(`${API}/auth/google/start?user_id=${userId}`);
      const data = await res.json();
      window.open(data.url, 'gmail_oauth', 'width=500,height=650,left=200,top=100');
      window.addEventListener('message', async (e) => {
        if (e.data?.type === 'gmail_connected') {
          showToast('Gmail connected ✓');
          await loadEmailAccount();
        }
      }, { once: true });
    } catch { showToast('Cannot reach ARIA server.', true); }
  }

  async function saveDigest() {
    try {
      const res = await fetch(
        `${API}/auth/google/digest-settings?user_id=${userId}&digest_time=${digestTime}&digest_enabled=${digestEnabled}`,
        { method: 'POST' }
      );
      if (!res.ok) { showToast('Failed to save.', true); return; }
      showToast('Digest settings saved ✓');
    } catch { showToast('Cannot reach ARIA server.', true); }
  }

  async function testDigest() {
    showToast('Sending test digest…');
    try {
      const res = await fetch(`${API}/auth/google/test-digest?user_id=${userId}`, { method: 'POST' });
      if (!res.ok) { const e = await res.json(); showToast(e.detail || 'Failed.', true); return; }
      const d = await res.json();
      showToast(`Digest sent! (${d.email_count} emails summarized)`);
    } catch { showToast('Cannot reach ARIA server.', true); }
  }

  async function disconnectGmail() {
    await fetch(`${API}/auth/google/disconnect?user_id=${userId}`, { method: 'DELETE' });
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
