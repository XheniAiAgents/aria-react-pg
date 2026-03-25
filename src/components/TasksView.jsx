import { apiFetch } from '../utils/apiFetch';
import { useState, useEffect, useRef } from 'react';
import { fmtDatetime } from '../utils/helpers';

// ── Reusable CircularWheel (same as EventModal) ───────────────────────────────
function CircularWheel({ items, value, onChange, height = 180, onItemClick }) {
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
      <div style={{ position:'absolute',top:0,left:0,right:0,height:'40%',background:'linear-gradient(to bottom,var(--raised),transparent)',zIndex:2,pointerEvents:'none' }}/>
      <div style={{ position:'absolute',bottom:0,left:0,right:0,height:'40%',background:'linear-gradient(to top,var(--raised),transparent)',zIndex:2,pointerEvents:'none' }}/>
      <div style={{ position:'absolute',top:'50%',transform:'translateY(-50%)',left:0,right:0,height:itemH,background:'var(--w3)',borderTop:'1px solid var(--w-line)',borderBottom:'1px solid var(--w-line)',zIndex:1,pointerEvents:'none',borderRadius:'4px' }}/>
      <div ref={ref} onScroll={handleScroll} style={{ height:'100%',overflowY:'scroll',scrollSnapType:'y mandatory',scrollbarWidth:'none',paddingTop:height/2-itemH/2,paddingBottom:height/2-itemH/2 }}>
        {tripled.map((_, i) => {
          const item = items[i % items.length];
          const isSelected = item === value;
          return (
            <div key={i}
              onClick={() => { onChange(item); onItemClick && onItemClick(item); if(ref.current) ref.current.scrollTop = (items.length + items.indexOf(item)) * itemH; }}
              style={{ height:itemH,display:'flex',alignItems:'center',justifyContent:'center',scrollSnapAlign:'center',cursor:'pointer',position:'relative',zIndex:3,
                fontSize:isSelected?'28px':'18px',fontFamily:'Cormorant Garamond,serif',
                color:isSelected?'var(--ink)':'var(--ghost)',transition:'all 0.15s' }}>
              {String(item).padStart(2,'0')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── TimePicker (same as EventModal) ───────────────────────────────────────────
function TimePicker({ value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('wheel');
  const [h, setH] = useState(9);
  const [m, setM] = useState(0);
  const [kbH, setKbH] = useState('09');
  const [kbM, setKbM] = useState('00');
  const hours = Array.from({length:24},(_,i)=>i);
  const mins  = Array.from({length:60},(_,i)=>i);
  const hourRef = useRef(null);
  const minRef  = useRef(null);

  useEffect(() => {
    if (value) {
      const [hh, mm] = value.split(':').map(Number);
      setH(hh); setM(mm);
      setKbH(String(hh).padStart(2,'0'));
      setKbM(String(mm).padStart(2,'0'));
    }
  }, [value]);

  function confirm() {
    if (mode === 'keyboard') {
      const hh = Math.min(23, Math.max(0, parseInt(kbH) || 0));
      const mm = Math.min(59, Math.max(0, parseInt(kbM) || 0));
      onChange(`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`);
    } else {
      onChange(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
    setOpen(false);
  }

  function clear() { onChange(''); setOpen(false); }

  const displayH = mode === 'keyboard' ? kbH : String(h).padStart(2,'0');
  const displayM = mode === 'keyboard' ? kbM : String(m).padStart(2,'0');

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
        <div style={{ position:'fixed',inset:0,zIndex:2000,background:'rgba(0,0,0,0.6)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:'24px' }}
          onClick={()=>setOpen(false)}>
          <div style={{ background:'var(--raised)',border:'1px solid var(--w-line)',borderRadius:'16px',
            padding:'16px',width:'100%',maxWidth:'300px',boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }}
            onClick={e=>e.stopPropagation()}>
            <div onClick={() => setMode(m => m === 'wheel' ? 'keyboard' : 'wheel')}
              style={{ fontSize:'32px', fontFamily:'Cormorant Garamond,serif', color:'var(--ink)',
                textAlign:'center', marginBottom:'8px', cursor:'pointer',
                borderBottom:'1px dashed var(--trace)', paddingBottom:'8px' }}>
              {displayH}<span style={{color:'var(--a1)'}}>:</span>{displayM}
            </div>
            {mode === 'wheel' ? (
              <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                <CircularWheel items={hours} value={h} onChange={setH} />
                <div style={{ fontSize:'24px', color:'var(--a1)', fontFamily:'Cormorant Garamond,serif' }}>:</div>
                <CircularWheel items={mins} value={m} onChange={setM} />
              </div>
            ) : (
              <div style={{ display:'flex', gap:'8px', alignItems:'center', padding:'12px 0' }}>
                <input ref={hourRef} type="number" min="0" max="23" value={kbH}
                  onChange={e => setKbH(e.target.value.slice(-2).padStart(2,'0'))}
                  style={{ flex:1, fontSize:'32px', fontFamily:'Cormorant Garamond,serif', textAlign:'center',
                    background:'var(--w3)', border:'1px solid var(--w-line)', borderRadius:'8px', padding:'8px',
                    color:'var(--ink)', outline:'none' }} />
                <div style={{ fontSize:'28px', color:'var(--a1)', fontFamily:'Cormorant Garamond,serif' }}>:</div>
                <input ref={minRef} type="number" min="0" max="59" value={kbM}
                  onChange={e => setKbM(e.target.value.slice(-2).padStart(2,'0'))}
                  style={{ flex:1, fontSize:'32px', fontFamily:'Cormorant Garamond,serif', textAlign:'center',
                    background:'var(--w3)', border:'1px solid var(--w-line)', borderRadius:'8px', padding:'8px',
                    color:'var(--ink)', outline:'none' }} />
              </div>
            )}
            <div style={{ display:'flex', gap:'8px', marginTop:'10px', borderTop:'1px solid var(--trace)', paddingTop:'10px' }}>
              <button type="button" onClick={clear} style={{ flex:1,padding:'7px',background:'transparent',border:'1px solid var(--trace)',borderRadius:'7px',color:'var(--ghost)',fontSize:'12px',cursor:'pointer' }}>Clear</button>
              <button type="button" onClick={confirm} style={{ flex:2,padding:'7px',background:'var(--w1)',border:'none',borderRadius:'7px',color:'#fff',fontSize:'12px',fontWeight:500,cursor:'pointer' }}>Set Time</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mini date picker (same style as EventModal) ───────────────────────────────
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT  = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const today = new Date().toISOString().split('T')[0];

  function getDaysInMonth(m, y) { return new Date(y, m+1, 0).getDate(); }
  function getFirstDay(m, y) { return (new Date(y, m, 1).getDay() + 6) % 7; }

  function selectDay(day) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onChange(ds);
    setOpen(false);
  }

  function formatDisplay(ds) {
    if (!ds) return null;
    return new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = getFirstDay(month, year);

  return (
    <div style={{ position: 'relative' }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display:'flex', alignItems:'center', gap:'8px',
        padding:'10px 12px', borderRadius:'8px',
        background:'var(--raised)', border:'1px solid var(--trace)',
        cursor:'pointer', fontSize:'13px',
        color: value ? 'var(--mist)' : 'var(--ghost)',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:0.5,flexShrink:0}}>
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span style={{flex:1}}>{formatDisplay(value) || 'Pick a date…'}</span>
        {value && <span onClick={e=>{e.stopPropagation();onChange('');}} style={{color:'var(--ghost)',fontSize:'15px',cursor:'pointer'}}>×</span>}
      </div>

      {open && (
        <div style={{ position:'fixed',inset:0,zIndex:2000,background:'rgba(0,0,0,0.6)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:'24px' }}
          onClick={() => setOpen(false)}>
          <div style={{ background:'var(--raised)',border:'1px solid var(--w-line)',borderRadius:'16px',
            padding:'16px',width:'100%',maxWidth:'320px',boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
              <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }}
                style={{background:'none',border:'none',color:'var(--mist)',cursor:'pointer',fontSize:'18px',padding:'4px 8px'}}>‹</button>
              <span style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'16px', color:'var(--ink)' }}>{MONTHS_FULL[month]} {year}</span>
              <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }}
                style={{background:'none',border:'none',color:'var(--mist)',cursor:'pointer',fontSize:'18px',padding:'4px 8px'}}>›</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px', marginBottom:'6px' }}>
              {DAYS_SHORT.map(d => <div key={d} style={{ textAlign:'center', fontSize:'10px', color:'var(--ghost)', padding:'4px 0', letterSpacing:'0.05em' }}>{d}</div>)}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px' }}>
              {Array.from({length: firstDay}, (_, i) => <div key={`e${i}`} />)}
              {Array.from({length: daysInMonth}, (_, i) => {
                const day = i+1;
                const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isToday = ds === today;
                const isSelected = ds === value;
                return (
                  <div key={day} onClick={() => selectDay(day)} style={{
                    textAlign:'center', padding:'8px 0', borderRadius:'50%', cursor:'pointer',
                    fontSize:'13px', fontFamily:'Cormorant Garamond,serif',
                    background: isSelected ? 'var(--a1)' : isToday ? 'var(--w3)' : 'transparent',
                    color: isSelected ? '#fff' : isToday ? 'var(--a1)' : 'var(--ink)',
                    fontWeight: isToday ? 600 : 400,
                  }}>{day}</div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main TasksView ─────────────────────────────────────────────────────────────
export default function TasksView({ API, userId, visible, showToast, t }) {
  const [pending, setPending] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [doneCbs, setDoneCbs] = useState({});

  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  const longPressTimer = useRef(null);

  useEffect(() => { if (visible) loadTasks(); }, [visible]);

  async function loadTasks() {
    try {
      const [pendingRes, completedRes] = await Promise.all([
        apiFetch('/tasks?only_pending=true').then(r => r.json()),
        apiFetch('/tasks?only_pending=false').then(r => r.json()),
      ]);
      setPending(pendingRes.tasks || []);
      setCompleted((completedRes.tasks || []).filter(t => t.done === 1));
    } catch {}
  }

  function buildReminder(date, time) {
    if (!date || !time) return null;
    return new Date(`${date}T${time}:00`).toISOString();
  }

  function splitReminder(reminder_at) {
    if (!reminder_at) return { date: '', time: '' };
    const d = new Date(reminder_at);
    if (isNaN(d)) return { date: '', time: '' };
    return {
      date: d.toLocaleDateString('en-CA'),
      time: d.toTimeString().slice(0, 5),
    };
  }

  async function submitTask() {
    if (!newTitle.trim()) { showToast(t('addTask') + '…', true); return; }
    try {
      const res = await apiFetch('/tasks', {
        method: 'POST',
        json: { title: newTitle, reminder_at: buildReminder(newDate, newTime) }
      });
      if (!res.ok) { const e = await res.json(); throw new Error(JSON.stringify(e)); }
      setNewTitle(''); setNewDate(''); setNewTime(''); setAddOpen(false);
      await loadTasks();
      showToast('Task added.');
    } catch (e) { showToast('Error: ' + e.message, true); }
  }

  async function completeTask(id) {
    setDoneCbs(d => ({ ...d, [id]: true }));
    await apiFetch(`/tasks/${id}/complete`, { method: 'POST' });
    setTimeout(() => loadTasks(), 600);
  }

  async function deleteTask(id) {
    await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
    loadTasks();
  }

  function openEdit(task) {
    const { date, time } = splitReminder(task.reminder_at);
    setEditId(task.id);
    setEditTitle(task.title);
    setEditDate(date);
    setEditTime(time);
  }

  function cancelEdit() {
    setEditId(null); setEditTitle(''); setEditDate(''); setEditTime('');
  }

  async function saveEdit() {
    if (!editTitle.trim()) return;
    try {
      await apiFetch(`/tasks/${editId}`, {
        method: 'PUT',
        json: { title: editTitle, reminder_at: buildReminder(editDate, editTime) }
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
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  function renderTask(task, isDone) {
    return (
      <div key={task.id} className="task-item"
        onMouseDown={() => !isDone && handlePressStart(task)}
        onMouseUp={handlePressEnd} onMouseLeave={handlePressEnd}
        onTouchStart={() => !isDone && handlePressStart(task)}
        onTouchEnd={handlePressEnd} onTouchCancel={handlePressEnd}
        style={isDone ? { opacity: 0.5 } : {}}>
        <div className={`task-cb${isDone || doneCbs[task.id] ? ' done' : ''}`}
          onClick={e => { e.stopPropagation(); if (!isDone) completeTask(task.id); }} />
        <div className="task-body">
          <div className={`task-title-text${isDone || doneCbs[task.id] ? ' done' : ''}`}>{task.title}</div>
          {task.reminder_at && !isDone && <div className="task-reminder">⏰ {fmtDatetime(task.reminder_at)}</div>}
        </div>
        {isDone && <button className="task-del" onClick={() => deleteTask(task.id)}>delete</button>}
      </div>
    );
  }

  return (
    <div id="tasksView" style={{ display: visible ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
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
          <DatePicker value={newDate} onChange={setNewDate} />
          <TimePicker value={newTime} onChange={setNewTime} placeholder="Set time…" />
        </div>
        <div className="form-actions" style={{ marginTop: '8px' }}>
          <button className="btn-ghost" onClick={() => { setAddOpen(false); setNewTitle(''); setNewDate(''); setNewTime(''); }}>Cancel</button>
          <button className="btn-primary" onClick={submitTask}>Add</button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        <div className="task-section-label">{t('pending')}</div>
        <div className="task-list">
          {!pending.length
            ? <div style={{ fontSize: '12px', color: 'var(--ghost)', fontStyle: 'italic', padding: '8px 0' }}>{t('noTasks')}</div>
            : pending.map(task => renderTask(task, false))}
        </div>
        {completed.length > 0 && (
          <>
            <div className="task-section-label" style={{ marginTop: '16px' }}>Completed</div>
            <div className="task-list">{completed.map(task => renderTask(task, true))}</div>
          </>
        )}
      </div>

      {pending.length > 0 && editId === null && (
        <div style={{ fontSize: '10px', color: 'var(--ghost)', textAlign: 'center', padding: '8px 0', fontStyle: 'italic' }}>
          Long press to edit or delete
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editId !== null && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          zIndex: 1000, padding: '80px 20px 20px',
        }} onClick={cancelEdit}>
          <div style={{
            background: 'var(--surface)', borderRadius: '16px',
            padding: '24px', width: '100%', maxWidth: '420px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', gap: '14px',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '18px', fontFamily: 'Cormorant Garamond, serif', color: 'var(--ink)' }}>Edit Task</div>
            <input className="form-input" value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
              autoFocus style={{ fontSize: '15px', padding: '10px 12px' }} />
            <DatePicker value={editDate} onChange={setEditDate} />
            <TimePicker value={editTime} onChange={setEditTime} placeholder="Set time…" />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={cancelEdit}>Cancel</button>
              <button className="btn-ghost" style={{ color: '#e05370' }}
                onClick={() => { deleteTask(editId); cancelEdit(); }}>Delete</button>
              <button className="btn-primary" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
