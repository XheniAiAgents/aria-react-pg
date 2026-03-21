import { useState, useEffect, useRef } from 'react';
import { fmtDatetime } from '../utils/helpers';

// Convert datetime-local value (local time) to UTC ISO string for backend
function toUTC(localDatetime) {
  if (!localDatetime) return null;
  return new Date(localDatetime).toISOString();
}

export default function TasksView({ API, userId, visible, showToast, t }) {
  const [pending, setPending] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newReminder, setNewReminder] = useState('');
  const [doneCbs, setDoneCbs] = useState({});

  // Edit state
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editReminder, setEditReminder] = useState('');

  // Long-press
  const longPressTimer = useRef(null);

  useEffect(() => { if (visible) loadTasks(); }, [visible]);

  async function loadTasks() {
    try {
      const [pendingRes, completedRes] = await Promise.all([
        fetch(`${API}/tasks/${userId}?only_pending=true`).then(r => r.json()),
        fetch(`${API}/tasks/${userId}?only_pending=false`).then(r => r.json()),
      ]);
      const pendingTasks = pendingRes.tasks || [];
      const allTasks = completedRes.tasks || [];
      setPending(pendingTasks);
      setCompleted(allTasks.filter(t => t.done === 1));
    } catch {}
  }

  async function submitTask() {
    if (!newTitle.trim()) { showToast(t('addTask') + '…', true); return; }
    try {
      const res = await fetch(`${API}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, title: newTitle, reminder_at: toUTC(newReminder) })
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

  function openEdit(task) {
    setEditId(task.id);
    setEditTitle(task.title);
    setEditReminder(task.reminder_at ? task.reminder_at.replace(' ', 'T').slice(0, 16) : '');
  }

  function cancelEdit() {
    setEditId(null);
    setEditTitle('');
    setEditReminder('');
  }

  async function saveEdit() {
    if (!editTitle.trim()) return;
    try {
      await fetch(`${API}/tasks/${editId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, title: editTitle, reminder_at: toUTC(editReminder) })
      });
      cancelEdit();
      await loadTasks();
      showToast('Task updated.');
    } catch { showToast('Error saving task.', true); }
  }

  function handlePressStart(task) {
    longPressTimer.current = setTimeout(() => openEdit(task), 500);
  }

  function handlePressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function renderTask(task, isDone) {
    if (editId === task.id) {
      return (
        <div key={task.id} className="add-task-form open" style={{ marginBottom: '6px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input className="form-input" value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
              autoFocus />
            <input className="form-input" type="datetime-local" style={{ colorScheme: 'dark' }}
              value={editReminder} onChange={e => setEditReminder(e.target.value)} />
          </div>
          <div className="form-actions">
            <button className="btn-ghost" onClick={cancelEdit}>Cancel</button>
            <button className="btn-ghost" style={{ color: '#e05370' }}
              onClick={() => { deleteTask(task.id); cancelEdit(); }}>Delete</button>
            <button className="btn-primary" onClick={saveEdit}>Save</button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={task.id}
        className="task-item"
        onMouseDown={() => !isDone && handlePressStart(task)}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={() => !isDone && handlePressStart(task)}
        onTouchEnd={handlePressEnd}
        onTouchCancel={handlePressEnd}
        style={isDone ? { opacity: 0.5 } : {}}
      >
        <div className={`task-cb${isDone || doneCbs[task.id] ? ' done' : ''}`}
          onClick={e => { e.stopPropagation(); if (!isDone) completeTask(task.id); }} />
        <div className="task-body">
          <div className={`task-title-text${isDone || doneCbs[task.id] ? ' done' : ''}`}>{task.title}</div>
          {task.reminder_at && !isDone && <div className="task-reminder">⏰ {fmtDatetime(task.reminder_at)}</div>}
        </div>
        {isDone && (
          <button className="task-del" onClick={() => deleteTask(task.id)}>delete</button>
        )}
      </div>
    );
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

      {/* Add form */}
      <div className={`add-task-form${addOpen ? ' open' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input className="form-input" placeholder={t('addTask') + '…'} value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitTask()} />
          <input className="form-input" type="datetime-local" style={{ colorScheme: 'dark' }}
            value={newReminder} onChange={e => setNewReminder(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="btn-ghost" onClick={() => { setAddOpen(false); setNewTitle(''); setNewReminder(''); }}>Cancel</button>
          <button className="btn-primary" onClick={submitTask}>Add</button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {/* Pending */}
        <div className="task-section-label">{t('pending')}</div>
        <div className="task-list">
          {!pending.length
            ? <div style={{ fontSize: '12px', color: 'var(--ghost)', fontStyle: 'italic', padding: '8px 0' }}>{t('noTasks')}</div>
            : pending.map(task => renderTask(task, false))}
        </div>

        {/* Completed */}
        {completed.length > 0 && (
          <>
            <div className="task-section-label" style={{ marginTop: '16px' }}>Completed</div>
            <div className="task-list">
              {completed.map(task => renderTask(task, true))}
            </div>
          </>
        )}
      </div>

      {pending.length > 0 && editId === null && (
        <div style={{ fontSize: '10px', color: 'var(--ghost)', textAlign: 'center', padding: '8px 0', fontStyle: 'italic' }}>
          Long press to edit or delete
        </div>
      )}
    </div>
  );
}
