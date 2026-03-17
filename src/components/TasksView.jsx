import { useState, useEffect } from 'react';
import { fmtDatetime } from '../utils/helpers';

export default function TasksView({ API, userId, visible, showToast, t }) {
  const [tasks, setTasks] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newReminder, setNewReminder] = useState('');
  const [doneCbs, setDoneCbs] = useState({});

  useEffect(() => { if (visible) loadTasks(); }, [visible]);

  async function loadTasks() {
    try {
      const { tasks } = await (await fetch(`${API}/tasks/${userId}?only_pending=true`)).json();
      setTasks(tasks || []);
    } catch {}
  }

  async function submitTask() {
    if (!newTitle.trim()) { showToast(t('addTask') + '…', true); return; }
    try {
      const res = await fetch(`${API}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, title: newTitle, reminder_at: newReminder || null })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(JSON.stringify(e)); }
      setNewTitle(''); setNewReminder(''); setAddOpen(false);
      await loadTasks();
      showToast('Task added.');
    } catch (e) { showToast('Error: ' + e.message, true); }
  }

  async function completeTask(id) {
    setDoneCbs(d => ({ ...d, [id]: true }));
    await fetch(`${API}/tasks/${id}/complete?user_id=${userId}`, { method: 'POST' });
    setTimeout(() => loadTasks(), 600);
  }

  async function deleteTask(id) {
    await fetch(`${API}/tasks/${id}?user_id=${userId}`, { method: 'DELETE' });
    loadTasks();
  }

  return (
    <div id="tasksView" style={{ display: visible ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      <div className="tasks-header">
        <div className="tasks-title">{t('tasks')}</div>
        <button className="add-btn" onClick={() => setAddOpen(o => !o)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {t('addTask')}
        </button>
      </div>
      <div className={`add-task-form${addOpen ? ' open' : ''}`}>
        <div className="form-row">
          <input className="form-input" placeholder={t('addTask') + '…'} value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitTask()} />
          <input className="form-input" type="datetime-local" style={{ colorScheme: 'dark', maxWidth: '200px' }}
            value={newReminder} onChange={e => setNewReminder(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={submitTask}>Add</button>
        </div>
      </div>
      <div className="task-section-label">{t('pending')}</div>
      <div className="task-list">
        {!tasks.length ? (
          <div style={{ fontSize: '12px', color: 'var(--ghost)', fontStyle: 'italic', padding: '8px 0' }}>{t('noTasks')}</div>
        ) : tasks.map(task => (
          <div key={task.id} className="task-item">
            <div className={`task-cb${doneCbs[task.id] ? ' done' : ''}`} onClick={() => completeTask(task.id)} />
            <div className="task-body">
              <div className={`task-title-text${doneCbs[task.id] ? ' done' : ''}`}>{task.title}</div>
              {task.reminder_at && <div className="task-reminder">⏰ {fmtDatetime(task.reminder_at)}</div>}
            </div>
            <button className="task-del" onClick={() => deleteTask(task.id)}>delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
