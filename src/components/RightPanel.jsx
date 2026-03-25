import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch';

export default function RightPanel({ API, userId, msgCount, memCount, refreshTick, t }) {
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);

  const load = useCallback(async () => {
    try {
      const { tasks } = await (await apiFetch('/tasks')).json();
      setTasks((tasks || []).slice(0, 4));
    } catch {}
    try {
      const today = new Date().toISOString().split('T')[0];
      const { events } = await (await apiFetch(`/events?date=${today}`)).json();
      setEvents(events || []);
    } catch {}
  }, [API, userId]);

  useEffect(() => { load(); }, [load, refreshTick]);

  async function completeTask(id) {
    await apiFetch(`/tasks/${id}/complete`, { method: 'POST' });
    load();
  }

  return (
    <aside className="right">
      <div className="r-sec">
        <div className="r-label">{t('upcomingTasks')}</div>
        {!tasks.length
          ? <div style={{ fontSize: '10px', color: 'var(--ghost)', fontStyle: 'italic' }}>{t('noPendingTasks')}</div>
          : tasks.map(task => (
            <div key={task.id} className="r-task">
              <div className="r-task-cb" onClick={() => completeTask(task.id)} />
              <div className="r-task-text">{task.title}</div>
            </div>
          ))}
      </div>
      <div className="r-sec">
        <div className="r-label">{t('todayEvents')}</div>
        {!events.length
          ? <div style={{ fontSize: '10px', color: 'var(--ghost)', fontStyle: 'italic' }}>{t('nothingScheduled')}</div>
          : events.map(e => (
            <div key={e.id} className="r-event">
              <div className="r-event-time">{e.event_time || '—'}</div>
              <div className="r-event-title">{e.title}</div>
            </div>
          ))}
      </div>
      <div className="r-sec">
        <div className="r-label">{t('today')}</div>
        <div className="stat-item">
          <div className="stat-top"><span className="stat-label">{t('messages')}</span><span className="stat-val">{msgCount}</span></div>
          <div className="track"><div className="fill" style={{ width: `${Math.min(msgCount * 8, 100)}%` }} /></div>
        </div>
        <div className="stat-item">
          <div className="stat-top"><span className="stat-label">{t('context')}</span><span className="stat-val">{memCount}</span></div>
          <div className="track"><div className="fill" style={{ width: `${Math.min(memCount * 12, 100)}%` }} /></div>
        </div>
      </div>
    </aside>
  );
}
