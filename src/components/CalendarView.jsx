import { useState, useEffect, useCallback } from 'react';
import EventModal from './EventModal';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOWS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export default function CalendarView({ API, userId, visible, showToast, onEventsChanged, t }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(now.toISOString().split('T')[0]);
  const [calEvents, setCalEvents] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const todayStr = now.toISOString().split('T')[0];

  const loadEvents = useCallback(async () => {
    try {
      const { events } = await (await fetch(`${API}/events/${userId}/month?year=${year}&month=${month + 1}`)).json();
      const map = {};
      (events || []).forEach(e => {
        if (!map[e.event_date]) map[e.event_date] = [];
        map[e.event_date].push(e);
      });
      setCalEvents(map);
    } catch {}
  }, [API, userId, year, month]);

  useEffect(() => { if (visible) loadEvents(); }, [visible, loadEvents]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  async function deleteEvent(id) {
    await fetch(`${API}/events/${id}?user_id=${userId}`, { method: 'DELETE' });
    await loadEvents();
    onEventsChanged && onEventsChanged();
  }

  // Build grid
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const dayEvents = calEvents[selectedDate] || [];
  const upcoming = [];
  Object.keys(calEvents).sort().forEach(ds => {
    if (ds > todayStr) calEvents[ds].forEach(e => upcoming.push({ ...e, dateStr: ds }));
  });

  const todayLabel = t ? t('today') : 'Today';
  const addEventLabel = t ? t('addEvent') : 'Add event';
  const noEventsLabel = t ? t('noEvents') : 'No events.';
  const noUpcomingLabel = t ? t('noUpcoming') : 'No upcoming events.';

  return (
    <div id="calView" style={{ display: visible ? 'flex' : 'none', flexDirection: 'column', overflowY: 'auto', padding: '24px 32px' }}>
      {/* Header */}
      <div className="cal-header">
        <div className="cal-title">{MONTHS[month]} {year}</div>
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <span className="cal-month-label">{MONTHS[month]} {year}</span>
          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
        </div>
        <button className="add-btn" onClick={() => setModalOpen(true)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {addEventLabel}
        </button>
      </div>

      {/* Grid */}
      <div className="cal-grid">
        {DOWS.map(d => <div key={d} className="cal-dow">{d}</div>)}
        {Array.from({ length: startDow }, (_, i) => (
          <div key={`prev-${i}`} className="cal-day other-month">
            <div className="cal-day-num">{prevMonthDays - startDow + i + 1}</div>
          </div>
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDate;
          const hasEvents = calEvents[ds];
          return (
            <div key={ds} className={`cal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`} onClick={() => setSelectedDate(ds)}>
              <div className="cal-day-num">{d}</div>
              {hasEvents && (
                <div className="cal-dots">
                  {hasEvents.slice(0, 3).map((_, j) => <div key={j} className="cal-dot" />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Day Events */}
      <div className="cal-events">
        <div className="cal-events-header">
          <div className="cal-events-title">
            {selectedDate === todayStr ? todayLabel : selectedDate} — events
          </div>
        </div>
        {!dayEvents.length
          ? <div className="no-events">{noEventsLabel}</div>
          : dayEvents.map(e => (
            <div key={e.id} className="event-item">
              <div className="event-time">{e.event_time || '—'}</div>
              <div className="event-body">
                <div className="event-title-text">{e.title}</div>
                {e.description && <div className="event-desc">{e.description}</div>}
              </div>
              <button className="event-del" onClick={() => deleteEvent(e.id)}>delete</button>
            </div>
          ))}
      </div>

      {/* Upcoming */}
      <div style={{ marginTop: '24px' }}>
        <div className="cal-events-header">
          <div className="cal-events-title">Upcoming</div>
        </div>
        {!upcoming.length
          ? <div className="no-events">{noUpcomingLabel}</div>
          : upcoming.slice(0, 6).map((e, i) => {
            const isToday = e.dateStr === todayStr;
            const dateLabel = isToday ? todayLabel
              : new Date(e.dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            return (
              <div key={i} className="event-item">
                <div className="event-time" style={{ minWidth: '60px', fontSize: '9px' }}>
                  <div style={{ color: 'var(--a2)' }}>{dateLabel}</div>
                  <div>{e.event_time || '—'}</div>
                </div>
                <div className="event-body">
                  <div className="event-title-text">{e.title}</div>
                  {e.description && <div className="event-desc">{e.description}</div>}
                </div>
                <button className="event-del" onClick={() => deleteEvent(e.id)}>delete</button>
              </div>
            );
          })}
      </div>

      <EventModal
        API={API} userId={userId} selectedDate={selectedDate}
        open={modalOpen} onClose={() => setModalOpen(false)}
        onAdded={async () => { await loadEvents(); onEventsChanged && onEventsChanged(); }}
        showToast={showToast}
      />
    </div>
  );
}
