import { useState, useEffect, useRef } from 'react';

function CircularWheel({ items, value, onChange, height = 160, onItemClick }) {
  const ref = useRef(null);
  const itemH = 40;
  const tripled = [...items, ...items, ...items];
  const isProgrammaticScroll = useRef(false);

  useEffect(() => {
    const idx = items.indexOf(value);
    if (ref.current && idx >= 0) {
      isProgrammaticScroll.current = true;
      ref.current.scrollTop = (items.length + idx) * itemH;
      setTimeout(() => { isProgrammaticScroll.current = false; }, 100);
    }
  }, [value]);

  function handleScroll() {
    if (!ref.current || isProgrammaticScroll.current) return;
    const scrollTop = ref.current.scrollTop;
    const idx = Math.round(scrollTop / itemH);
    if (idx < items.length * 0.5) { ref.current.scrollTop = scrollTop + items.length * itemH; return; }
    if (idx >= items.length * 2.5) { ref.current.scrollTop = scrollTop - items.length * itemH; return; }
    const realIdx = idx % items.length;
    if (items[realIdx] !== value) onChange(items[realIdx]);
  }

  return (
    <div style={{ flex: 1, position: 'relative', height }}>
      <div style={{ position:'absolute',top:0,left:0,right:0,height:'35%',background:'linear-gradient(to bottom,var(--raised),transparent)',zIndex:2,pointerEvents:'none' }}/>
      <div style={{ position:'absolute',bottom:0,left:0,right:0,height:'35%',background:'linear-gradient(to top,var(--raised),transparent)',zIndex:2,pointerEvents:'none' }}/>
      <div style={{ position:'absolute',top:'50%',transform:'translateY(-50%)',left:4,right:4,height:itemH,background:'var(--w3)',border:'1px solid var(--w-line)',borderRadius:'6px',zIndex:1,pointerEvents:'none' }}/>
      <div ref={ref} onScroll={handleScroll} style={{ height:'100%',overflowY:'scroll',scrollSnapType:'y mandatory',scrollbarWidth:'none',paddingTop:height/2-itemH/2,paddingBottom:height/2-itemH/2 }}>
        {tripled.map((_, i) => {
          const realItem = items[i % items.length];
          const isSelected = realItem === value;
          return (
            <div key={i} onClick={() => {
              if (onItemClick) { onItemClick(realItem); } else { onChange(realItem); }
              if (ref.current) {
                isProgrammaticScroll.current = true;
                ref.current.scrollTop = (items.length + items.indexOf(realItem)) * itemH;
                setTimeout(() => { isProgrammaticScroll.current = false; }, 100);
              }
            }} style={{
              height:itemH,display:'flex',alignItems:'center',justifyContent:'center',
              scrollSnapAlign:'center',cursor:'pointer',zIndex:3,position:'relative',
              fontSize:isSelected?'24px':'16px',fontFamily:'Cormorant Garamond,serif',
              color:isSelected?'var(--ink)':'var(--ghost)',transition:'all 0.15s',
            }}>{String(realItem).padStart(2,'0')}</div>
          );
        })}
      </div>
    </div>
  );
}

function TimePicker({ value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('wheel');
  const [h, setH] = useState(9);
  const [m, setM] = useState(0);
  const hourRef = useRef(null);
  const minRef  = useRef(null);
  const hours = Array.from({length:24},(_,i)=>i);
  const mins  = Array.from({length:60},(_,i)=>i);

  useEffect(() => {
    if (value) {
      const [hh, mm] = value.split(':').map(Number);
      setH(hh); setM(mm);
    }
  }, [value]);

  function switchToKeyboard(field, val) {
    if (field === 'hour' && val !== undefined) setH(val);
    if (field === 'min' && val !== undefined) setM(val);
    setMode('keyboard');
    setTimeout(() => {
      if (field === 'hour' && hourRef.current) hourRef.current.focus();
      if (field === 'min' && minRef.current) minRef.current.focus();
    }, 50);
  }

  function confirm() {
    onChange(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    setOpen(false);
  }

  function clear() { onChange(''); setOpen(false); }

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
        {value && <span onClick={e=>{e.stopPropagation();clear();}} style={{color:'var(--ghost)',fontSize:'15px',cursor:'pointer'}}>x</span>}
      </button>

      {open && (
        <div style={{ position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:999,
          background:'var(--raised)',border:'1px solid var(--w-line)',borderRadius:'12px',
          padding:'12px',boxShadow:'0 16px 48px rgba(0,0,0,0.5)' }}>
          <div onClick={() => setMode(m => m==='wheel'?'keyboard':'wheel')}
            style={{ fontSize:'32px',fontFamily:'Cormorant Garamond,serif',color:'var(--ink)',
              letterSpacing:'-0.02em',textAlign:'center',marginBottom:'8px',cursor:'pointer',
              borderBottom:'1px dashed var(--trace)',paddingBottom:'8px' }}>
            {String(h).padStart(2,'0')}<span style={{color:'var(--a1)'}}>:</span>{String(m).padStart(2,'0')}
          </div>
          {mode === 'wheel' ? (
            <div style={{ display:'flex',gap:'8px',alignItems:'center' }}>
              <CircularWheel items={hours} value={h} onChange={setH} onItemClick={(v) => switchToKeyboard('hour', v)} />
              <div style={{ fontSize:'24px',color:'var(--a1)',fontFamily:'Cormorant Garamond,serif' }}>:</div>
              <CircularWheel items={mins} value={m} onChange={setM} onItemClick={(v) => switchToKeyboard('min', v)} />
            </div>
          ) : (
            <div style={{ display:'flex',gap:'8px',alignItems:'center',padding:'12px 0' }}>
              <input type="number" min="0" max="23" value={String(h).padStart(2,'0')}
                onChange={e => setH(Math.min(23,Math.max(0,parseInt(e.target.value)||0)))}
                style={{ flex:1,fontSize:'32px',fontFamily:'Cormorant Garamond,serif',textAlign:'center',
                  background:'var(--w3)',border:'1px solid var(--w-line)',borderRadius:'8px',padding:'8px',
                  color:'var(--ink)',outline:'none' }} ref={hourRef} autoFocus />
              <div style={{ fontSize:'28px',color:'var(--a1)',fontFamily:'Cormorant Garamond,serif' }}>:</div>
              <input type="number" min="0" max="59" value={String(m).padStart(2,'0')}
                onChange={e => setM(Math.min(59,Math.max(0,parseInt(e.target.value)||0)))}
                style={{ flex:1,fontSize:'32px',fontFamily:'Cormorant Garamond,serif',textAlign:'center',
                  background:'var(--w3)',border:'1px solid var(--w-line)',borderRadius:'8px',padding:'8px',
                  color:'var(--ink)',outline:'none' }} ref={minRef} />
            </div>
          )}
          <div style={{ display:'flex',gap:'8px',marginTop:'12px',borderTop:'1px solid var(--trace)',paddingTop:'10px' }}>
            <button type="button" onClick={clear} style={{ flex:1,padding:'7px',background:'transparent',border:'1px solid var(--trace)',borderRadius:'7px',color:'var(--ghost)',fontSize:'12px',cursor:'pointer',fontFamily:'DM Sans,sans-serif' }}>Clear</button>
            <button type="button" onClick={confirm} style={{ flex:2,padding:'7px',background:'var(--w1)',border:'none',borderRadius:'7px',color:'#fff',fontSize:'12px',fontWeight:500,cursor:'pointer',fontFamily:'DM Sans,sans-serif' }}>Set Time</button>
          </div>
        </div>
      )}
    </div>
  );
}

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

export default function EventModal({ API, userId, selectedDate, open, onClose, onAdded, showToast, editEvent, onEdited }) {
  const isEdit = !!editEvent;
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate || '');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [desc, setDesc] = useState('');
  const [remind, setRemind] = useState('15');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dpMonth, setDpMonth] = useState(new Date().getMonth());
  const [dpYear, setDpYear] = useState(new Date().getFullYear());

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
      setTitle(''); setDate(selectedDate || '');
      setTime(''); setEndTime(''); setDesc(''); setRemind('15');
    }
    if (selectedDate) {
      const d = new Date(selectedDate + 'T12:00:00');
      setDpMonth(d.getMonth()); setDpYear(d.getFullYear());
    }
  }, [open, editEvent, selectedDate]);

  function getDaysInMonth(m,y) { return new Date(y,m+1,0).getDate(); }
  function getFirstDay(m,y) { return (new Date(y,m,1).getDay()+6)%7; }

  function selectDate(day) {
    const ds = `${dpYear}-${String(dpMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    setDate(ds); setDatePickerOpen(false);
  }

  function formatDateDisplay(ds) {
    if (!ds) return null;
    return new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric',month:'short',year:'numeric' });
  }

  async function submitEvent() {
    if (!title.trim()) { showToast('Please add a title.', true); return; }
    if (!date) { showToast('Please pick a date.', true); return; }
    const today = new Date(); today.setHours(0,0,0,0);
    const picked = new Date(date + 'T00:00:00');
    if (picked < today) { showToast('Date cannot be in the past.', true); return; }
    if (time && endTime && endTime <= time) { showToast('End time must be after start time.', true); return; }
    const body = {
      user_id: userId, title,
      event_date: date,
      event_time: time || null,
      end_time: endTime || null,
      description: desc || null,
      reminder_minutes: parseInt(remind) || 15
    };
    if (isEdit) {
      await fetch(`${API}/events/${editEvent.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      onClose(); onEdited && onEdited(); showToast('Event updated.');
    } else {
      await fetch(`${API}/events`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      onClose(); onAdded && onAdded(); showToast('Event added.');
    }
  }

  const today = new Date();
  const totalDays = getDaysInMonth(dpMonth, dpYear);
  const firstDay = getFirstDay(dpMonth, dpYear);

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxHeight:'90vh', overflowY:'auto' }}>
        <div className="modal-title">{isEdit ? 'Edit Event' : 'Add Event'}</div>

        <input className="modal-input" placeholder="Event title..." value={title}
          onChange={e => setTitle(e.target.value)} autoFocus />

        <div style={{ position:'relative', marginBottom:'8px' }}>
          <button type="button" onClick={() => setDatePickerOpen(o=>!o)} style={{
            width:'100%', background:'var(--raised)', border:'1px solid var(--trace)',
            borderRadius:'8px', padding:'10px 12px', display:'flex', alignItems:'center',
            gap:'8px', cursor:'pointer', color: date ? 'var(--mist)' : 'var(--ghost)',
            fontSize:'13px', fontFamily:'DM Sans,sans-serif', textAlign:'left',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:0.5,flexShrink:0}}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>{formatDateDisplay(date) || 'Pick a date...'}</span>
          </button>
          {datePickerOpen && (
            <div style={{ position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:999,
              background:'var(--raised)',border:'1px solid var(--w-line)',borderRadius:'12px',padding:'14px',
              boxShadow:'0 16px 48px rgba(0,0,0,0.5)' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px' }}>
                <button type="button" onClick={() => { if(dpMonth===0){setDpMonth(11);setDpYear(y=>y-1);}else setDpMonth(m=>m-1); }}
                  style={{background:'none',border:'none',color:'var(--ghost)',cursor:'pointer',fontSize:'18px',padding:'2px 8px'}}>&#8249;</button>
                <span style={{fontSize:'13px',fontFamily:'Cormorant Garamond,serif',color:'var(--mist)'}}>
                  {MONTHS_FULL[dpMonth]} {dpYear}
                </span>
                <button type="button" onClick={() => { if(dpMonth===11){setDpMonth(0);setDpYear(y=>y+1);}else setDpMonth(m=>m+1); }}
                  style={{background:'none',border:'none',color:'var(--ghost)',cursor:'pointer',fontSize:'18px',padding:'2px 8px'}}>&#8250;</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:'4px'}}>
                {DAYS.map(d=><div key={d} style={{textAlign:'center',fontSize:'9px',color:'var(--ghost)',letterSpacing:'0.08em'}}>{d}</div>)}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'2px'}}>
                {Array.from({length:firstDay}).map((_,i)=><div key={'e'+i}/>)}
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

        <div className="modal-row" style={{ gap:'8px', marginBottom:'8px' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'10px',color:'var(--ghost)',marginBottom:'4px',letterSpacing:'0.06em',textTransform:'uppercase' }}>Start</div>
            <TimePicker value={time} onChange={setTime} placeholder="--:--" />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'10px',color:'var(--ghost)',marginBottom:'4px',letterSpacing:'0.06em',textTransform:'uppercase' }}>End</div>
            <TimePicker value={endTime} onChange={setEndTime} placeholder="--:--" />
          </div>
        </div>

        <input className="modal-input" placeholder="Description (optional)" value={desc}
          onChange={e => setDesc(e.target.value)} />

        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
          <span style={{ fontSize:'11px',color:'var(--ghost)',whiteSpace:'nowrap' }}>Remind me</span>
          <select className="modal-input" value={remind} onChange={e => setRemind(e.target.value)}
            style={{ flex:1, padding:'8px 12px' }}>
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
