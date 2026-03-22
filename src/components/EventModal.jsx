import { useState, useEffect } from 'react';

export default function EventModal({ API, userId, selectedDate, open, onClose, onAdded, showToast, editEvent, onEdited }) {
  const isEdit = !!editEvent;

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate || '');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [desc, setDesc] = useState('');
  const [remind, setRemind] = useState('15');

  // Populate fields when editing or when selectedDate changes
  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setTitle(editEvent.title || '');
      setDate(editEvent.event_date || '');
      setTime(editEvent.event_time || '');
      setEndTime(editEvent.end_time || '');
      setDesc(editEvent.description || '');
      setRemind(String(editEvent.reminder_minutes || 15));
    } else {
      setTitle('');
      setDate(selectedDate || '');
      setTime('');
      setEndTime('');
      setDesc('');
      setRemind('15');
    }
  }, [open, editEvent, selectedDate]);

  async function submitEvent() {
    if (!title.trim() || !date) { showToast('Title and date required.', true); return; }
    if (isEdit) {
      await fetch(`${API}/events/${editEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          title,
          event_date: date,
          event_time: time || null,
          end_time: endTime || null,
          description: desc || null,
          reminder_minutes: parseInt(remind) || 15
        })
      });
      onClose();
      onEdited && onEdited();
      showToast('Event updated.');
    } else {
      await fetch(`${API}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          title,
          event_date: date,
          event_time: time || null,
          end_time: endTime || null,
          description: desc || null,
          reminder_minutes: parseInt(remind) || 15
        })
      });
      onClose();
      onAdded && onAdded();
      showToast('Event added.');
    }
  }

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-title">{isEdit ? 'Edit Event' : 'Add Event'}</div>
        <input className="modal-input" placeholder="Event title…" value={title}
          onChange={e => setTitle(e.target.value)} autoFocus />
        <input className="modal-input" type="date" value={date}
          onChange={e => setDate(e.target.value)} />
        <div className="modal-row">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: 'var(--ghost)', marginBottom: '4px' }}>Start time</div>
            <input className="modal-input" type="time" value={time}
              onChange={e => setTime(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: 'var(--ghost)', marginBottom: '4px' }}>End time</div>
            <input className="modal-input" type="time" value={endTime}
              onChange={e => setEndTime(e.target.value)} style={{ width: '100%' }} />
          </div>
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
          <button className="btn-primary" onClick={submitEvent}>{isEdit ? 'Save' : 'Add event'}</button>
        </div>
      </div>
    </div>
  );
}
