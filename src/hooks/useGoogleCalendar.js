import { useState, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch';

export function useGoogleCalendar(API, userId, showToast) {
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState('');

  const loadCalendarStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch('/auth/google-calendar/status');
      const data = await res.json();
      setCalendarConnected(data.connected);
      if (data.connected) setCalendarEmail(data.calendar_email || '');
    } catch {}
  }, [API, userId]);

  async function connectCalendar() {
    try {
      const res = await apiFetch('/auth/google-calendar/start');
      const data = await res.json();
      window.open(data.url, 'calendar_oauth', 'width=500,height=650,left=200,top=100');
      window.addEventListener('message', async (e) => {
        if (e.data?.type === 'calendar_connected') {
          showToast('Google Calendar connected ✓');
          await loadCalendarStatus();
        }
      }, { once: true });
    } catch { showToast('Cannot reach ARIA server.', true); }
  }

  async function disconnectCalendar() {
    await apiFetch('/auth/google-calendar/disconnect', { method: 'DELETE' });
    setCalendarConnected(false);
    setCalendarEmail('');
    showToast('Google Calendar disconnected.');
  }

  return {
    calendarConnected, calendarEmail,
    loadCalendarStatus, connectCalendar, disconnectCalendar
  };
}
