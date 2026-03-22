import { useState, useEffect, useRef } from 'react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

export default function DateTimePicker({ value, onChange, placeholder = 'Set reminder…' }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('date'); // 'date' | 'time'
  const [selDate, setSelDate] = useState(null);
  const [selHour, setSelHour] = useState(null);
  const [selMin, setSelMin] = useState(null);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const ref = useRef(null);

  // Parse incoming value
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d)) {
        setSelDate(d);
        setSelHour(d.getHours());
        setSelMin(d.getMinutes());
        setMonth(d.getMonth());
        setYear(d.getFullYear());
      }
    } else {
      setSelDate(null);
      setSelHour(null);
      setSelMin(null);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, []);

  function getDaysInMonth(m, y) { return new Date(y, m + 1, 0).getDate(); }
  function getFirstDay(m, y) { return (new Date(y, m, 1).getDay() + 6) % 7; } // Mon=0

  function selectDay(day) {
    const d = new Date(year, month, day);
    setSelDate(d);
    setView('time');
    if (selHour === null) { setSelHour(9); setSelMin(0); }
  }

  function confirm() {
    if (!selDate) return;
    const d = new Date(selDate);
    d.setHours(selHour ?? 9, selMin ?? 0, 0, 0);
    onChange(d.toISOString());
    setOpen(false);
    setView('date');
  }

  function clear() {
    onChange(null);
    setSelDate(null);
    setSelHour(null);
    setSelMin(null);
    setOpen(false);
    setView('date');
  }

  function formatDisplay() {
    if (!selDate) return null;
    const d = new Date(selDate);
    if (selHour !== null) d.setHours(selHour, selMin ?? 0);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ' · ' + String(selHour ?? 9).padStart(2,'0') + ':' + String(selMin ?? 0).padStart(2,'0');
  }

  const totalDays = getDaysInMonth(month, year);
  const firstDay = getFirstDay(month, year);
  const today = new Date();
  const display = formatDisplay();

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'var(--surface)', border: '1px solid var(--trace)',
          borderRadius: '8px', padding: '9px 12px', display: 'flex', alignItems: 'center',
          gap: '8px', cursor: 'pointer', color: display ? 'var(--mist)' : 'var(--ghost)',
          fontSize: '13px', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.2s',
          textAlign: 'left',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6, flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
        </svg>
        <span style={{ flex: 1 }}>{display || placeholder}</span>
        {display && (
          <span onClick={(e) => { e.stopPropagation(); clear(); }}
            style={{ color: 'var(--ghost)', fontSize: '16px', lineHeight: 1, padding: '0 2px', cursor: 'pointer' }}>×</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--w-line)',
          borderRadius: '14px', padding: '16px', zIndex: 999,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px var(--trace)',
          animation: 'fadeIn 0.15s ease',
        }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', background: 'var(--deep)', borderRadius: '8px', padding: '3px' }}>
            {['date','time'].map(v => (
              <button key={v} type="button" onClick={() => setView(v)} style={{
                flex: 1, padding: '5px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
                fontFamily: 'DM Sans, sans-serif', transition: 'all 0.2s',
                background: view === v ? 'var(--w3)' : 'transparent',
                color: view === v ? 'var(--a2)' : 'var(--ghost)',
              }}>{v}</button>
            ))}
          </div>

          {view === 'date' && (
            <>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <button type="button" onClick={() => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }}
                  style={{ background: 'none', border: 'none', color: 'var(--ghost)', cursor: 'pointer', fontSize: '16px', padding: '4px 8px', borderRadius: '6px' }}>‹</button>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--mist)', fontFamily: 'Cormorant Garamond, serif', letterSpacing: '0.05em' }}>
                  {MONTHS[month]} {year}
                </span>
                <button type="button" onClick={() => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); }}
                  style={{ background: 'none', border: 'none', color: 'var(--ghost)', cursor: 'pointer', fontSize: '16px', padding: '4px 8px', borderRadius: '6px' }}>›</button>
              </div>

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '6px' }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 500, color: 'var(--ghost)', padding: '2px 0', letterSpacing: '0.08em' }}>{d}</div>
                ))}
              </div>

              {/* Days grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: totalDays }).map((_, i) => {
                  const day = i + 1;
                  const thisDate = new Date(year, month, day);
                  const isToday = thisDate.toDateString() === today.toDateString();
                  const isSelected = selDate && thisDate.toDateString() === selDate.toDateString();
                  const isPast = thisDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  return (
                    <button key={day} type="button" onClick={() => !isPast && selectDay(day)} style={{
                      aspectRatio: '1', border: 'none', borderRadius: '50%', cursor: isPast ? 'not-allowed' : 'pointer',
                      fontSize: '12px', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                      background: isSelected ? 'var(--w1)' : isToday ? 'var(--w3)' : 'transparent',
                      color: isSelected ? '#fff' : isPast ? 'var(--vapor)' : isToday ? 'var(--a2)' : 'var(--mist)',
                      fontWeight: isSelected || isToday ? 600 : 400,
                      boxShadow: isSelected ? '0 0 12px var(--a-glow)' : 'none',
                    }}>{day}</button>
                  );
                })}
              </div>
            </>
          )}

          {view === 'time' && (
            <div>
              <p style={{ fontSize: '11px', color: 'var(--ghost)', textAlign: 'center', marginBottom: '14px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {selDate ? selDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Pick a date first'}
              </p>

              {/* Time display */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '42px', fontFamily: 'Cormorant Garamond, serif', fontWeight: 300, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  {String(selHour ?? 9).padStart(2,'0')}
                  <span style={{ color: 'var(--a1)', margin: '0 2px' }}>:</span>
                  {String(selMin ?? 0).padStart(2,'0')}
                </span>
              </div>

              {/* Hour slider */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--ghost)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hour</span>
                  <span style={{ fontSize: '10px', color: 'var(--a2)' }}>{String(selHour ?? 9).padStart(2,'0')}</span>
                </div>
                <input type="range" min="0" max="23" value={selHour ?? 9}
                  onChange={e => setSelHour(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--w1)', height: '3px', cursor: 'pointer' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--vapor)' }}>00</span>
                  <span style={{ fontSize: '9px', color: 'var(--vapor)' }}>23</span>
                </div>
              </div>

              {/* Minute slider */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--ghost)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Minute</span>
                  <span style={{ fontSize: '10px', color: 'var(--a2)' }}>{String(selMin ?? 0).padStart(2,'0')}</span>
                </div>
                <input type="range" min="0" max="59" step="5" value={selMin ?? 0}
                  onChange={e => setSelMin(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--w1)', height: '3px', cursor: 'pointer' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--vapor)' }}>:00</span>
                  <span style={{ fontSize: '9px', color: 'var(--vapor)' }}>:55</span>
                </div>
              </div>

              {/* Quick time buttons */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                {[[9,0,'9am'],[12,0,'noon'],[18,0,'6pm'],[21,0,'9pm']].map(([h,m,label]) => (
                  <button key={label} type="button"
                    onClick={() => { setSelHour(h); setSelMin(m); }}
                    style={{
                      flex: 1, padding: '5px 4px', border: '1px solid var(--trace)', borderRadius: '6px',
                      background: selHour === h && selMin === m ? 'var(--w3)' : 'transparent',
                      color: selHour === h && selMin === m ? 'var(--a2)' : 'var(--ghost)',
                      fontSize: '11px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      transition: 'all 0.15s',
                    }}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', borderTop: '1px solid var(--trace)', paddingTop: '12px' }}>
            <button type="button" onClick={clear} style={{
              flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--trace)',
              borderRadius: '8px', color: 'var(--ghost)', fontSize: '12px', cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', transition: 'all 0.2s',
            }}>Clear</button>
            <button type="button" onClick={confirm} disabled={!selDate}
              style={{
                flex: 2, padding: '8px', background: selDate ? 'var(--w1)' : 'var(--trace)',
                border: 'none', borderRadius: '8px', color: selDate ? '#fff' : 'var(--ghost)',
                fontSize: '12px', fontWeight: 500, cursor: selDate ? 'pointer' : 'not-allowed',
                fontFamily: 'DM Sans, sans-serif', transition: 'all 0.2s',
                boxShadow: selDate ? '0 0 16px var(--a-glow)' : 'none',
              }}>Set Reminder</button>
          </div>
        </div>
      )}
    </div>
  );
}
