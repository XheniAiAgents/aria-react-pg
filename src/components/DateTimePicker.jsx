import { useState, useEffect, useRef } from 'react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function ScrollWheel({ items, value, onChange, height = 180, onItemClick }) {
  const ref = useRef(null);
  const itemH = 44;
  const tripled = [...items, ...items, ...items];

  useEffect(() => {
    const idx = items.indexOf(value);
    if (ref.current && idx >= 0) {
      ref.current.scrollTop = (items.length + idx) * itemH;
    }
  }, [value]);

  function handleScroll() {
    if (!ref.current) return;
    const scrollTop = ref.current.scrollTop;
    const idx = Math.round(scrollTop / itemH);
    if (idx < items.length * 0.5) { ref.current.scrollTop = scrollTop + items.length * itemH; return; }
    if (idx >= items.length * 2.5) { ref.current.scrollTop = scrollTop - items.length * itemH; return; }
    const realIdx = idx % items.length;
    if (items[realIdx] !== value) onChange(items[realIdx]);
  }

  return (
    <div style={{ flex:1, position:'relative', height }}>
      <div style={{ position:'absolute',top:0,left:0,right:0,height:'40%',background:'linear-gradient(to bottom,var(--surface),transparent)',zIndex:2,pointerEvents:'none' }}/>
      <div style={{ position:'absolute',bottom:0,left:0,right:0,height:'40%',background:'linear-gradient(to top,var(--surface),transparent)',zIndex:2,pointerEvents:'none' }}/>
      <div style={{ position:'absolute',top:'50%',transform:'translateY(-50%)',left:0,right:0,height:itemH,background:'var(--w3)',borderTop:'1px solid var(--w-line)',borderBottom:'1px solid var(--w-line)',zIndex:1,pointerEvents:'none',borderRadius:'4px' }}/>
      <div ref={ref} onScroll={handleScroll} style={{ height:'100%',overflowY:'scroll',scrollSnapType:'y mandatory',scrollbarWidth:'none',paddingTop:height/2-itemH/2,paddingBottom:height/2-itemH/2 }}>
        {tripled.map((_, i) => {
          const item = items[i % items.length];
          const isSelected = item === value;
          return (
            <div key={i} onClick={() => { onChange(item); if(ref.current) ref.current.scrollTop = (items.length + items.indexOf(item)) * itemH; if(onItemClick) onItemClick(item); }}
              style={{ height:itemH,display:'flex',alignItems:'center',justifyContent:'center',scrollSnapAlign:'center',cursor:'pointer',position:'relative',zIndex:3,
                fontSize:isSelected?'28px':'18px',fontFamily:'Cormorant Garamond,serif',fontWeight:isSelected?400:300,
                color:isSelected?'var(--ink)':'var(--ghost)',transition:'all 0.15s',letterSpacing:'-0.01em' }}>
              {String(item).padStart(2,'0')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DateTimePicker({ value, onChange, placeholder = 'Set reminder...' }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('date');
  const [timeMode, setTimeMode] = useState('wheel');
  const [selDate, setSelDate] = useState(null);
  const [selHour, setSelHour] = useState(9);
  const [selMin, setSelMin] = useState(0);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const ref = useRef(null);

  const hours = Array.from({length:24},(_,i)=>i);
  const mins  = Array.from({length:60},(_,i)=>i);
  const hourInputRef = useRef(null);
  const minInputRef  = useRef(null);

  function switchToKeyboard(field, val) {
    if (field === 'hour' && val !== undefined) setSelHour(val);
    if (field === 'min' && val !== undefined) setSelMin(val);
    setTimeMode('keyboard');
    setTimeout(() => {
      if (field === 'hour' && hourInputRef.current) hourInputRef.current.focus();
      if (field === 'min' && minInputRef.current) minInputRef.current.focus();
    }, 50);
  }

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d)) {
        setSelDate(d); setSelHour(d.getHours()); setSelMin(d.getMinutes());
        setMonth(d.getMonth()); setYear(d.getFullYear());
      }
    } else {
      setSelDate(null); setSelHour(9); setSelMin(0);
    }
  }, [value]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, []);

  function getDaysInMonth(m,y) { return new Date(y,m+1,0).getDate(); }
  function getFirstDay(m,y) { return (new Date(y,m,1).getDay()+6)%7; }

  function selectDay(day) {
    setSelDate(new Date(year, month, day));
    setView('time');
  }

  function confirm() {
    if (!selDate) return;
    const d = new Date(selDate);
    d.setHours(selHour, selMin, 0, 0);
    onChange(d.toISOString());
    setOpen(false); setView('date'); setTimeMode('wheel');
  }

  function clear() {
    onChange(null); setSelDate(null); setSelHour(9); setSelMin(0);
    setOpen(false); setView('date'); setTimeMode('wheel');
  }

  function formatDisplay() {
    if (!selDate) return null;
    const d = new Date(selDate);
    d.setHours(selHour, selMin);
    return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) + ' · ' +
      String(selHour).padStart(2,'0') + ':' + String(selMin).padStart(2,'0');
  }

  const totalDays = getDaysInMonth(month, year);
  const firstDay  = getFirstDay(month, year);
  const today     = new Date();
  const display   = formatDisplay();

  return (
    <div ref={ref} style={{ position:'relative', width:'100%' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width:'100%', background:'var(--surface)', border:'1px solid var(--trace)',
        borderRadius:'8px', padding:'9px 12px', display:'flex', alignItems:'center',
        gap:'8px', cursor:'pointer', color: display ? 'var(--mist)' : 'var(--ghost)',
        fontSize:'13px', fontFamily:'DM Sans, sans-serif', transition:'all 0.2s', textAlign:'left',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:0.6,flexShrink:0}}>
          <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
        </svg>
        <span style={{flex:1}}>{display || placeholder}</span>
        {display && (
          <span onClick={e => { e.stopPropagation(); clear(); }} style={{color:'var(--ghost)',fontSize:'16px',lineHeight:1,padding:'0 2px',cursor:'pointer'}}>x</span>
        )}
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', left:0, right:0,
          background:'var(--surface)', border:'1px solid var(--w-line)',
          borderRadius:'14px', padding:'16px', zIndex:999,
          boxShadow:'0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px var(--trace)',
          animation:'fadeIn 0.15s ease',
        }}>
          <div style={{display:'flex',gap:'4px',marginBottom:'14px',background:'var(--deep)',borderRadius:'8px',padding:'3px'}}>
            {['date','time'].map(v => (
              <button key={v} type="button" onClick={() => setView(v)} style={{
                flex:1, padding:'5px', border:'none', borderRadius:'6px', cursor:'pointer',
                fontSize:'11px', fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase',
                fontFamily:'DM Sans, sans-serif', transition:'all 0.2s',
                background: view===v ? 'var(--w3)' : 'transparent',
                color: view===v ? 'var(--a2)' : 'var(--ghost)',
              }}>{v}</button>
            ))}
          </div>

          {view === 'date' && (
            <>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
                <button type="button" onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }}
                  style={{background:'none',border:'none',color:'var(--ghost)',cursor:'pointer',fontSize:'18px',padding:'4px 8px',borderRadius:'6px'}}>&#8249;</button>
                <span style={{fontSize:'14px',fontFamily:'Cormorant Garamond, serif',color:'var(--mist)',letterSpacing:'0.05em'}}>
                  {MONTHS[month]} {year}
                </span>
                <button type="button" onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }}
                  style={{background:'none',border:'none',color:'var(--ghost)',cursor:'pointer',fontSize:'18px',padding:'4px 8px',borderRadius:'6px'}}>&#8250;</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:'6px'}}>
                {DAYS.map(d => <div key={d} style={{textAlign:'center',fontSize:'10px',fontWeight:500,color:'var(--ghost)',padding:'2px 0',letterSpacing:'0.08em'}}>{d}</div>)}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'2px'}}>
                {Array.from({length:firstDay}).map((_,i) => <div key={'e'+i}/>)}
                {Array.from({length:totalDays}).map((_,i) => {
                  const day = i+1;
                  const thisDate = new Date(year,month,day);
                  const isToday = thisDate.toDateString() === today.toDateString();
                  const isSelected = selDate && thisDate.toDateString() === selDate.toDateString();
                  const isPast = thisDate < new Date(today.getFullYear(),today.getMonth(),today.getDate());
                  return (
                    <button key={day} type="button" onClick={() => !isPast && selectDay(day)} style={{
                      aspectRatio:'1', border:'none', borderRadius:'50%', cursor:isPast?'not-allowed':'pointer',
                      fontSize:'12px', fontFamily:'DM Sans, sans-serif', transition:'all 0.15s',
                      background:isSelected?'var(--w1)':isToday?'var(--w3)':'transparent',
                      color:isSelected?'#fff':isPast?'var(--vapor)':isToday?'var(--a2)':'var(--mist)',
                      fontWeight:isSelected||isToday?600:400,
                    }}>{day}</button>
                  );
                })}
              </div>
            </>
          )}

          {view === 'time' && (
            <div>
              <p style={{fontSize:'11px',color:'var(--ghost)',textAlign:'center',marginBottom:'10px',letterSpacing:'0.06em',textTransform:'uppercase'}}>
                {selDate ? selDate.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) : 'Pick a date first'}
              </p>

              <div onClick={() => setTimeMode(m => m==='wheel' ? 'keyboard' : 'wheel')}
                style={{textAlign:'center',fontSize:'38px',fontFamily:'Cormorant Garamond,serif',color:'var(--ink)',
                  letterSpacing:'-0.02em',marginBottom:'8px',cursor:'pointer',
                  borderBottom:'1px dashed var(--trace)',paddingBottom:'8px'}}>
                {String(selHour).padStart(2,'0')}<span style={{color:'var(--a1)'}}>:</span>{String(selMin).padStart(2,'0')}
              </div>

              {timeMode === 'wheel' ? (
                <div style={{display:'flex',gap:'0',alignItems:'center',justifyContent:'center'}}>
                  <div style={{flex:1}}>
                    <div style={{textAlign:'center',fontSize:'9px',color:'var(--ghost)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'4px'}}>Hour</div>
                    <ScrollWheel items={hours} value={selHour} onChange={setSelHour} height={180} onItemClick={(v) => switchToKeyboard('hour', v)} />
                  </div>
                  <div style={{fontSize:'32px',fontFamily:'Cormorant Garamond,serif',color:'var(--a1)',padding:'0 8px',marginTop:'8px'}}>:</div>
                  <div style={{flex:1}}>
                    <div style={{textAlign:'center',fontSize:'9px',color:'var(--ghost)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'4px'}}>Min</div>
                    <ScrollWheel items={mins} value={selMin} onChange={setSelMin} height={180} onItemClick={(v) => switchToKeyboard('min', v)} />
                  </div>
                </div>
              ) : (
                <div style={{display:'flex',gap:'8px',alignItems:'center',padding:'16px 0'}}>
                  <input type="number" min="0" max="23" value={String(selHour).padStart(2,'0')}
                    onChange={e => { const v=Math.min(23,Math.max(0,parseInt(e.target.value)||0)); setSelHour(v); }}
                    style={{flex:1,fontSize:'36px',fontFamily:'Cormorant Garamond,serif',textAlign:'center',
                      background:'var(--w3)',border:'1px solid var(--w-line)',borderRadius:'8px',padding:'8px',
                      color:'var(--ink)',outline:'none'}} ref={hourInputRef} autoFocus />
                  <div style={{fontSize:'32px',color:'var(--a1)',fontFamily:'Cormorant Garamond,serif'}}>:</div>
                  <input type="number" min="0" max="59" value={String(selMin).padStart(2,'0')}
                    onChange={e => { const v=Math.min(59,Math.max(0,parseInt(e.target.value)||0)); setSelMin(v); }}
                    style={{flex:1,fontSize:'36px',fontFamily:'Cormorant Garamond,serif',textAlign:'center',
                      background:'var(--w3)',border:'1px solid var(--w-line)',borderRadius:'8px',padding:'8px',
                      color:'var(--ink)',outline:'none'}} ref={minInputRef} />
                </div>
              )}
            </div>
          )}

          <div style={{display:'flex',gap:'8px',marginTop:'14px',borderTop:'1px solid var(--trace)',paddingTop:'12px'}}>
            <button type="button" onClick={clear} style={{
              flex:1, padding:'8px', background:'transparent', border:'1px solid var(--trace)',
              borderRadius:'8px', color:'var(--ghost)', fontSize:'12px', cursor:'pointer',
              fontFamily:'DM Sans, sans-serif',
            }}>Clear</button>
            <button type="button" onClick={confirm} disabled={!selDate} style={{
              flex:2, padding:'8px',
              background:selDate?'var(--w1)':'var(--trace)',
              border:'none', borderRadius:'8px',
              color:selDate?'#fff':'var(--ghost)',
              fontSize:'12px', fontWeight:500, cursor:selDate?'pointer':'not-allowed',
              fontFamily:'DM Sans, sans-serif',
              boxShadow:selDate?'0 0 16px var(--a-glow)':'none',
            }}>Set Reminder</button>
          </div>
        </div>
      )}
    </div>
  );
}
