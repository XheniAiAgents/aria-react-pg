import { useState, useEffect } from 'react';
import DateTimePicker from './DateTimePicker';

// Simple time-only picker using our scroll wheel approach
function TimePicker({ value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(9);
  const [m, setM] = useState(0);

  useEffect(() => {
    if (value) {
      const [hh, mm] = value.split(':').map(Number);
      setH(hh); setM(mm);
    }
  }, [value]);

  function confirm() {
    onChange(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    setOpen(false);
  }

  function clear() { onChange(''); setOpen(false); }

  const hours = Array.from({length:24},(_,i)=>i);
  const mins  = Array.from({length:60},(_,i)=>i);
  const itemH = 40;

  function ScrollCol({ items, val, onVal }) {
    const ref = useState(null);
    const domRef = ref[0];
    const setRef = ref[1];

    useEffect(() => {
      if (domRef) {
        const idx = items.indexOf(val);
        domRef.scrollTop = idx * itemH;
      }
    }, [val, domRef]);

    return (
      <div style={{ flex: 1, position: 'relative', height: 160 }}>
        <div style={{ position:'absolute',top:0,left:0,right:0,height:'35%',background:'linear-gradient(to bottom,var(--raised),transparent)',zIndex:2,pointerEvents:'none' }}/>
        <div style={{ position:'absolute',bottom:0,left:0,right:0,height:'35%',background:'linear-gradient(to top,var(--raised),transparent)',zIndex:2,pointerEvents:'none' }}/>
        <div style={{ position:'absolute',top:'50%',transform:'translateY(-50%)',left:4,right:4,height:itemH,background:'var(--w3)',border:'1px solid var(--w-line)',borderRadius:'6px',zIndex:1,pointerEvents:'none' }}/>
        <div ref={setRef}
          onScroll={e => {
            const idx = Math.round(e.target.scrollTop / itemH);
            const c = Math.max(0, Math.min(items.length-1, idx));
            if (items[c] !== val) onVal(items[c]);
          }}
          style={{ height:'100%',overflowY:'scroll',scrollSnapType:'y mandatory',scrollbarWidth:'none',
            paddingTop:160/2-itemH/2, paddingBottom:160/2-itemH/2 }}>
          {items.map((item,i) => (
            <div key={i} onClick={() => { onVal(item); if(setRef.current) setRef.current = null; }}
              style={{ height:itemH,display:'flex',alignItems:'center',justifyContent:'center',
                scrollSnapAlign:'center',cursor:'pointer',position:'relative',zIndex:3,
                fontSize: item===val?'24px':'16px',
                fontFamily:'Cormorant Garamond,serif',
                color: item===val?'var(--ink)':'var(--ghost)',
                transition:'all 0.15s',
              }}>{String(item).padStart(2,'0')}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:'relative' }}>
      <button type="button" onClick={() => setOpen(o=>!o)} style={{
        width:'100%', background:'var(--raised)', border:'1px solid var(--trace)',
        borderRadius:'8px', padding:'10px 12px', display:'flex', alignItems:'center',
        gap:'8px', cursor:'pointer', color: value ? 'var(--mist)' : 'var(--ghost)',
        fontSize:'13px', fontFamily:'DM Sans,sans-serif', textAlign:'left',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:0.5,flexShrink:0}}>
          <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
        </svg>
        <span style={{flex:1}}>{value || placeholder}</span>
        {value && <span onClick={e=>{e.stopPropagation();clear();}} style={{color:'var(--ghost)',fontSize:'15px',cursor:'pointer'}}>×</span>}
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:999,
          background:'var(--raised)', border:'1px solid var(--w-line)', borderRadius:'12px',
          padding:'12px', boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
        }}>
          <div style={{ textAlign:'center', fontSize:'32px', fontFamily:'Cormorant Garamond,serif', color:'var(--ink)', marginBottom:'8px', letterSpacing:'-0.02em' }}>
            {String(h).padStart(2,'0')}<span style={{color:'var(--a1)'}}>:</span>{String(m).padStart(2,'0')}
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <ScrollCol items={hours} val={h} onVal={setH} />
            <div style={{ fontSize:'24px', color:'var(--a1)', fontFamily:'Cormorant Garamond,serif' }}>:</div>
            <ScrollCol items={mins} val={m} onVal={setM} />
          </div>
          <div style={{ display:'flex', gap:'8px', marginTop:'12px', borderTop:'1px solid var(--trace)', paddingTop:'10px' }}>
            <button type="button" onClick={clear} style={{ flex:1,padding:'7px',background:'transparent',border:'1px solid var(--trace)',borderRadius:'7px',color:'var(--ghost)',fontSize:'12px',cursor:'pointer',fontFamily:'DM Sans,sans-serif' }}>Clear</button>
            <button type="button" onClick={confirm} style={{ flex:2,padding:'7px',background:'var(--w1)',border:'none',borderRadius:'7px',color:'#fff',fontSize:'12px',fontWeight:500,cursor:'pointer',fontFamily:'DM Sans,sans-serif' }}>Set Time</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Convert local HH:MM to UTC HH:MM for backend storage
function localTimeToUTC(dateStr, timeStr) {
  if (!dateStr || !timeStr) return timeStr;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

// Convert UTC HH:MM from backend to local HH:MM for display
function utcTimeToLocal(dateStr, timeStr) {
  if (!dateStr || !timeStr) return timeStr;
  const d = new Date(`${dateStr}T${timeStr}:00Z`);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function EventModal({ API, userId, selectedDate, open, onClose, onAdded, showToast, editEvent, onEdited }) {
  const isEdit = !!editEvent;
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate || '');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [desc, setDesc] = useState('');
  const [remind, setRemind] = useState('15');

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setTitle(editEvent.title || '');
      setDate(editEvent.event_date || '');
      setTime(editEvent.event_time ? utcTimeToLocal(editEvent.event_date, editEvent.event_time) : '');
      setEndTime(editEvent.end_time ? utcTimeToLocal(editEvent.event_date, editEvent.end_time) : '');
      setDesc(editEvent.description || '');
      setRemind(String(editEvent.reminder_minutes || 15));
    } else {
      setTitle(''); setDate(selectedDate || '');
      setTime(''); setEndTime(''); setDesc(''); setRemind('15');
    }
  }, [open, editEvent, selectedDate]);

  // Date picker state - use a DateTimePicker-like approach but date-only
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dpMonth, setDpMonth] = useState(new Date().getMonth());
  const [dpYear, setDpYear] = useState(new Date().getFullYear());

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  function getDaysInMonth(m,y) { return new Date(y,m+1,0).getDate(); }
  function getFirstDay(m,y) { return (new Date(y,m,1).getDay()+6)%7; }

  function selectDate(day) {
    const ds = `${dpYear}-${String(dpMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    setDate(ds);
    setDatePickerOpen(false);
  }

  function formatDateDisplay(ds) {
    if (!ds) return null;
    const d = new Date(ds + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function submitEvent() {
    if (!title.trim() || !date) { showToast('Title and date required.', true); return; }
    const utcTime = time ? localTimeToUTC(date, time) : null;
    const utcEndTime = endTime ? localTimeToUTC(date, endTime) : null;
    const body = { user_id: userId, title, event_date: date, event_time: utcTime, end_time: utcEndTime, description: desc || null, reminder_minutes: parseInt(remind) || 15 };
    if (isEdit) {
      await fetch(`${API}/events/${editEvent.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      onClose(); onEdited && onEdited(); showToast('Event updated.');
    } else {
      await fetch(`${API}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      onClose(); onAdded && onAdded(); showToast('Event added.');
    }
  }

  const today = new Date();
  const totalDays = getDaysInMonth(dpMonth, dpYear);
  const firstDay = getFirstDay(dpMonth, dpYear);

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-title">{isEdit ? 'Edit Event' : 'Add Event'}</div>

        {/* Title */}
        <input className="modal-input" placeholder="Event title…" value={title}
          onChange={e => setTitle(e.target.value)} autoFocus />

        {/* Date picker */}
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <button type="button" onClick={() => setDatePickerOpen(o=>!o)} style={{
            width:'100%', background:'var(--raised)', border:'1px solid var(--trace)',
            borderRadius:'8px', padding:'10px 12px', display:'flex', alignItems:'center',
            gap:'8px', cursor:'pointer', color: date ? 'var(--mist)' : 'var(--ghost)',
            fontSize:'13px', fontFamily:'DM Sans,sans-serif', textAlign:'left',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:0.5,flexShrink:0}}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>{formatDateDisplay(date) || 'Pick a date…'}</span>
          </button>

          {datePickerOpen && (
            <div style={{ position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:999,
              background:'var(--raised)',border:'1px solid var(--w-line)',borderRadius:'12px',padding:'14px',
              boxShadow:'0 16px 48px rgba(0,0,0,0.5)' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px' }}>
                <button type="button" onClick={() => { if(dpMonth===0){setDpMonth(11);setDpYear(y=>y-1);}else setDpMonth(m=>m-1); }}
                  style={{background:'none',border:'none',color:'var(--ghost)',cursor:'pointer',fontSize:'18px',padding:'2px 8px'}}>‹</button>
                <span style={{fontSize:'13px',fontFamily:'Cormorant Garamond,serif',color:'var(--mist)'}}>
                  {MONTHS_FULL[dpMonth]} {dpYear}
                </span>
                <button type="button" onClick={() => { if(dpMonth===11){setDpMonth(0);setDpYear(y=>y+1);}else setDpMonth(m=>m+1); }}
                  style={{background:'none',border:'none',color:'var(--ghost)',cursor:'pointer',fontSize:'18px',padding:'2px 8px'}}>›</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:'4px'}}>
                {DAYS.map(d=><div key={d} style={{textAlign:'center',fontSize:'9px',color:'var(--ghost)',letterSpacing:'0.08em'}}>{d}</div>)}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'2px'}}>
                {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
                {Array.from({length:totalDays}).map((_,i)=>{
                  const day=i+1;
                  const ds=`${dpYear}-${String(dpMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  const isToday=ds===today.toISOString().split('T')[0];
                  const isSelected=ds===date;
                  return(
                    <button key={day} type="button" onClick={()=>selectDate(day)} style={{
                      aspectRatio:'1',border:'none',borderRadius:'50%',cursor:'pointer',
                      fontSize:'12px',fontFamily:'DM Sans,sans-serif',transition:'all 0.15s',
                      background:isSelected?'var(--w1)':isToday?'var(--w3)':'transparent',
                      color:isSelected?'#fff':isToday?'var(--a2)':'var(--mist)',
                      fontWeight:isSelected||isToday?600:400,
                    }}>{day}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Start / End time */}
        <div className="modal-row" style={{ gap: '8px', marginBottom: '8px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: 'var(--ghost)', marginBottom: '4px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Start</div>
            <TimePicker value={time} onChange={setTime} placeholder="—" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: 'var(--ghost)', marginBottom: '4px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>End</div>
            <TimePicker value={endTime} onChange={setEndTime} placeholder="—" />
          </div>
        </div>

        {/* Description */}
        <input className="modal-input" placeholder="Description (optional)" value={desc}
          onChange={e => setDesc(e.target.value)} />

        {/* Remind me */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--ghost)', whiteSpace: 'nowrap' }}>Remind me</span>
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
