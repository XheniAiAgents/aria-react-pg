/**
 * DateTimePicker — simple native inputs, works on all devices
 * Props:
 *   value: ISO string or null
 *   onChange: (isoString | null) => void
 */
import { useState, useEffect } from 'react';

export default function DateTimePicker({ value, onChange }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [open, setOpen] = useState(false);

  // Parse incoming value into date + time
  useEffect(() => {
    if (!value) { setDate(''); setTime(''); return; }
    const d = new Date(value);
    if (isNaN(d)) { setDate(''); setTime(''); return; }
    setDate(d.toLocaleDateString('en-CA')); // YYYY-MM-DD
    setTime(d.toTimeString().slice(0, 5));  // HH:MM
  }, [value]);

  function handleDate(e) {
    const newDate = e.target.value;
    setDate(newDate);
    if (newDate && time) commit(newDate, time);
    else if (!newDate) onChange(null);
  }

  function handleTime(e) {
    const newTime = e.target.value;
    setTime(newTime);
    if (date && newTime) commit(date, newTime);
  }

  function commit(d, t) {
    const iso = new Date(`${d}T${t}:00`).toISOString();
    onChange(iso);
  }

  function clear(e) {
    e.stopPropagation();
    setDate(''); setTime('');
    onChange(null);
    setOpen(false);
  }

  const label = date && time
    ? `${new Date(`${date}T${time}`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${time}`
    : date
    ? new Date(date + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '8px',
          background: 'var(--raised)', border: '1px solid var(--trace)',
          cursor: 'pointer', fontSize: '13px', color: label ? 'var(--ink)' : 'var(--ghost)',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '14px' }}>⏰</span>
        <span style={{ flex: 1 }}>{label || 'Set reminder…'}</span>
        {label && (
          <span onClick={clear} style={{ fontSize: '16px', color: 'var(--ghost)', lineHeight: 1, padding: '0 2px' }}>×</span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--trace)',
          borderRadius: '10px', padding: '12px', zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: 'var(--ghost)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Date</label>
            <input
              type="date"
              value={date}
              onChange={handleDate}
              style={{
                background: 'var(--raised)', border: '1px solid var(--trace)',
                borderRadius: '7px', padding: '8px 10px', color: 'var(--ink)',
                fontSize: '14px', width: '100%', boxSizing: 'border-box',
                colorScheme: 'dark',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: 'var(--ghost)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Time</label>
            <input
              type="time"
              value={time}
              onChange={handleTime}
              style={{
                background: 'var(--raised)', border: '1px solid var(--trace)',
                borderRadius: '7px', padding: '8px 10px', color: 'var(--ink)',
                fontSize: '14px', width: '100%', boxSizing: 'border-box',
                colorScheme: 'dark',
              }}
            />
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'var(--a1)', border: 'none', borderRadius: '7px',
              padding: '8px', color: 'white', fontSize: '13px',
              cursor: 'pointer', fontWeight: '500',
            }}
          >Done</button>
        </div>
      )}
    </div>
  );
}
