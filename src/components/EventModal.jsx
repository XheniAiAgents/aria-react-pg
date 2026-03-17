import { useState } from 'react';

export default function EventModal({ API, userId, selectedDate, open, onClose, onAdded, showToast }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate || '');
  const [time, setTime] = useState('');
  const [desc, setDesc] = useState('');
  const [remind, setRemind] = useState('15');

  // Sync date with selectedDate prop
  if (open && date !== selectedDate && !title) {
    setDate(selectedDate || '');
  }

  async function submitEvent() {
    if (!title.trim() || !date) { showToast('Title and date required.', true); return; }
    await fetch(`${API}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        title,
        event_date: date,
        event_time: time || null,
        description: desc || null,
        reminder_minutes: parseInt(remind) || 15
      })
    });
    setTitle(''); setTime(''); setDesc('');
    onClose();
    onAdded();
    showToast('Event added.');
  }

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-title">Add Event</div>
        <input className="modal-input" placeholder="Event title…" value={title}
          onChange={e => setTitle(e.target.value)} autoFocus />
        <div className="modal-row">
          <input className="modal-input" type="date" value={date}
            onChange={e => setDate(e.target.value)} style={{ flex: 1 }} />
          <input className="modal-input" type="time" value={time}
            onChange={e => setTime(e.target.value)} style={{ flex: 1 }} />
        </div>
        <input className="modal-input" placeholder="Description (optional)" value={desc}
          onChange={e => setDesc(e.target.value)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--ghost)' }}>Remind me</span>
          <select className="modal-input" value={remind} onChange={e => setRemind(e.target.value)}
            style={{ flex: 1, padding: '8px 12px' }}>
            <option value="5">5 min before</option>
            <option value="15">15 min before</option>
            <option value="30">30 min before</option>
            <option value="60">1 hour before</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submitEvent}>Add event</button>
        </div>
      </div>
    </div>
  );
}
