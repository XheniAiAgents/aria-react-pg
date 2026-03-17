import { useEffect, useRef } from 'react';

export function useReminders(API, userId, onFire) {
  const notifiedEvents = useRef(new Set());
  const notifiedTasks = useRef(new Set());

  function playReminderSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[880, 0], [1100, 0.18]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + delay + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.6);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.65);
      });
    } catch {}
  }

  function fireReminder(icon, title, body) {
    playReminderSound();
    onFire(icon, title, body);
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification('ARIA — ' + title, { body, icon: '/icons/icon-192.png', silent: false });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 10000);
    }
  }

  async function checkReminders() {
    if (!userId) return;
    const now = new Date();
    const windowMs = 65000;
    try {
      const { events } = await (await fetch(`${API}/events/${userId}`)).json();
      for (const e of events) {
        if (notifiedEvents.current.has(e.id) || !e.event_time) continue;
        const eventDt = new Date(e.event_date + 'T' + e.event_time);
        const reminderDt = new Date(eventDt.getTime() - (e.reminder_minutes || 15) * 60000);
        if (reminderDt <= now && reminderDt > new Date(now.getTime() - windowMs) && eventDt > now) {
          notifiedEvents.current.add(e.id);
          fireReminder('📅', 'Upcoming event: ' + e.title, 'Starting at ' + e.event_time + (e.description ? ' — ' + e.description : ''));
        }
      }
    } catch {}
    try {
      const { tasks } = await (await fetch(`${API}/tasks/${userId}`)).json();
      for (const t of tasks) {
        if (notifiedTasks.current.has(t.id) || !t.reminder_at) continue;
        const reminderDt = new Date(t.reminder_at);
        if (reminderDt <= now && reminderDt > new Date(now.getTime() - windowMs)) {
          notifiedTasks.current.add(t.id);
          fireReminder('📌', 'Task reminder', t.title);
        }
      }
    } catch {}
  }

  useEffect(() => {
    if (!userId) return;
    checkReminders();
    const interval = setInterval(checkReminders, 60000);
    return () => clearInterval(interval);
  }, [userId]);
}
