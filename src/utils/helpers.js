export function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function fmt(s) {
  return esc(s)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

export function fmtDate(d) {
  if (!d) return '';
  const diff = Math.floor((new Date() - new Date(d)) / 86400000);
  return diff === 0 ? 'today' : diff === 1 ? 'yesterday' : `${diff}d ago`;
}

export function fmtDatetime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

export function getDateStr(d = new Date()) {
  return d.toISOString().split('T')[0];
}

export function getGreeting(userName, mode) {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const work = [
    `${g}, ${userName}.\n\nWhat are we working on today?`,
    `${g}, ${userName}. Ready when you are.\n\nWhat needs your attention first?`
  ];
  const life = [
    `${g}, ${userName} 🌿\n\n¿Qué tal? What's on your mind?`,
    `${g}, ${userName}.\n\nHere whenever you need me.`
  ];
  const msgs = mode === 'work' ? work : life;
  return msgs[Math.floor(Math.random() * msgs.length)];
}

export function formatProfileDate(d = new Date()) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]}`;
}
