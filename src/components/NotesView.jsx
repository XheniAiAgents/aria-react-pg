import { useState, useEffect, useRef, useCallback } from 'react';

const NOTE_COLORS = [
  { id: 'gold',    bg: 'rgba(201,168,76,0.15)',  border: 'rgba(201,168,76,0.4)',  text: '#c9a84c' },
  { id: 'purple',  bg: 'rgba(124,107,255,0.15)', border: 'rgba(124,107,255,0.4)', text: '#a599ff' },
  { id: 'teal',    bg: 'rgba(29,158,117,0.15)',  border: 'rgba(29,158,117,0.4)',  text: '#1d9e75' },
  { id: 'coral',   bg: 'rgba(232,100,80,0.15)',  border: 'rgba(232,100,80,0.4)',  text: '#e86450' },
  { id: 'amber',   bg: 'rgba(239,159,39,0.15)',  border: 'rgba(239,159,39,0.4)',  text: '#ef9f27' },
  { id: 'default', bg: 'var(--raised)',           border: 'var(--trace)',           text: 'var(--mist)' },
];

const TAGS = ['personal', 'work', 'ideas'];

// Convert HTML back to plain text for storage
function htmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  // Convert block elements to newlines
  div.querySelectorAll('div, p, li, h1, h2, h3').forEach(el => {
    el.insertAdjacentText('afterend', '\n');
  });
  div.querySelectorAll('ul, ol').forEach(el => {
    el.insertAdjacentText('afterend', '\n');
  });
  return div.innerText || div.textContent || '';
}

// Convert plain text/markdown to HTML for display
function textToHtml(text) {
  if (!text) return '';
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = s => esc(s)
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/__(.*?)__/g,'<u>$1</u>')
    .replace(/~~(.*?)~~/g,'<s>$1</s>')
    .replace(/`(.*?)`/g,'<code>$1</code>');

  const lines = text.split('\n');
  const out = []; let inUl=false, inOl=false;
  const close = () => {
    if(inUl){out.push('</ul>');inUl=false;}
    if(inOl){out.push('</ol>');inOl=false;}
  };
  for (const line of lines) {
    if (line.startsWith('### ')){ close(); out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { close(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# '))  { close(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (line.match(/^- /)) {
      if(!inUl){out.push('<ul>');inUl=true;} if(inOl){out.push('</ol>');inOl=false;}
      out.push(`<li>${inline(line.slice(2))}</li>`); continue;
    }
    if (line.match(/^\d+\. /)) {
      if(!inOl){out.push('<ol>');inOl=true;} if(inUl){out.push('</ul>');inUl=false;}
      out.push(`<li>${inline(line.replace(/^\d+\. /,''))}</li>`); continue;
    }
    close();
    if (!line.trim()) { out.push('<div><br></div>'); continue; }
    out.push(`<div>${inline(line)}</div>`);
  }
  close();
  return out.join('');
}

export default function NotesView({ API, userId, visible, showToast }) {
  const [notes, setNotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTag, setEditTag] = useState('personal');
  const [editColor, setEditColor] = useState('gold');
  const [saving, setSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const editorRef = useRef(null);
  const saveTimer = useRef(null);
  const contentRef = useRef(''); // track content without re-renders

  useEffect(() => { if (visible) loadNotes(); }, [visible]);

  async function loadNotes() {
    try {
      const { notes } = await (await fetch(`${API}/notes/${userId}`)).json();
      setNotes(notes || []);
    } catch {}
  }

  function openNote(note) {
    setSelected(note);
    setEditTitle(note.title);
    setEditTag(note.tag || 'personal');
    setEditColor(note.color || 'gold');
    setIsNew(false);
    setShowColorPicker(false);
    setMobileEditorOpen(true);
    contentRef.current = note.content || '';
    // Set editor HTML after render
    setTimeout(() => {
      if (editorRef.current) {
        // If content looks like HTML use it directly, otherwise convert from text
        const c = note.content || '';
        editorRef.current.innerHTML = c.startsWith('<') ? c : textToHtml(c);
      }
    }, 0);
  }

  function newNote() {
    const blank = { id: null, title: '', content: '', tag: 'personal', color: 'gold' };
    setSelected(blank);
    setEditTitle('');
    setEditTag('personal');
    setEditColor('gold');
    setIsNew(true);
    setShowColorPicker(false);
    contentRef.current = '';
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
        editorRef.current.focus();
      }
    }, 0);
  }

  function scheduleAutoSave(title, tag, color) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNote(title, tag, color), 1500);
  }

  async function saveNote(title, tag, color, closeAfter = false) {
    const content = contentRef.current;
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    try {
      const body = { user_id: userId, title: title || 'Untitled', content, tag, color };
      if (isNew) {
        const res = await fetch(`${API}/notes`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const { note_id } = await res.json();
        setSelected(s => ({ ...s, id: note_id }));
        setIsNew(false);
      } else if (selected?.id) {
        await fetch(`${API}/notes/${selected.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }
      await loadNotes();
      if (closeAfter) {
        setSelected(null);
        setMobileEditorOpen(false);
        if (editorRef.current) editorRef.current.innerHTML = '';
      }
    } catch { showToast('Error saving', true); }
    setSaving(false);
  }

  async function deleteNote() {
    if (!selected?.id) { setSelected(null); return; }
    try {
      await fetch(`${API}/notes/${selected.id}?user_id=${userId}`, { method: 'DELETE' });
      setSelected(null); setMobileEditorOpen(false);
      if (editorRef.current) editorRef.current.innerHTML = '';
      await loadNotes();
      showToast('Note deleted.');
    } catch { showToast('Error deleting', true); }
  }

  function handleEditorInput() {
    contentRef.current = editorRef.current?.innerHTML || '';
    scheduleAutoSave(editTitle, editTag, editColor);
  }

  // ── Toolbar commands ─────────────────────────────────────────────────────
  function execCmd(cmd, value = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  function insertListItem(type) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const prefix = type === 'ul' ? '• ' : '1. ';
    const row = document.createElement('div');
    row.className = type === 'ul' ? 'note-ul-row' : 'note-ol-row';
    row.setAttribute('data-list-type', type);

    // For ol, count existing ol rows to get next number
    if (type === 'ol') {
      const olRows = editor.querySelectorAll('.note-ol-row');
      row.setAttribute('data-num', olRows.length + 1);
      row.setAttribute('data-prefix', (olRows.length + 1) + '. ');
    } else {
      row.setAttribute('data-prefix', '• ');
    }

    const textNode = document.createTextNode('');
    row.appendChild(textNode);

    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    if (node.nodeType === 3) node = node.parentElement;
    const block = node.closest('div, p, h1, h2, h3') || node;

    if (block && block !== editor) {
      block.insertAdjacentElement('afterend', row);
    } else {
      range.collapse(false);
      range.insertNode(row);
    }

    const newRange = document.createRange();
    newRange.setStart(textNode, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    editor.focus();

    contentRef.current = editor.innerText || '';
    scheduleAutoSave(editTitle, editTag, editColor);
  }

  function insertCheckbox() {
    editorRef.current?.focus();
    const checkbox = document.createElement('div');
    checkbox.className = 'note-checkbox-row';
    checkbox.innerHTML = '<input type="checkbox" class="note-cb-input"> <span class="note-cb-text"></span>';
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      range.insertNode(checkbox);
      // Move cursor to text span
      const span = checkbox.querySelector('.note-cb-text');
      range.setStart(span, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    contentRef.current = editorRef.current?.innerHTML || '';
    scheduleAutoSave(editTitle, editTag, editColor);
  }

  // ── Auto-continue lists on Enter ─────────────────────────────────────────
  function handleKeyDown(e) {
    if (e.key !== 'Enter') return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const node = sel.getRangeAt(0).startContainer;
    const getEl = n => n.nodeType === 3 ? n.parentElement : n;

    // ── Checkbox row ──
    const row = getEl(node)?.closest('.note-checkbox-row');
    if (row) {
      e.preventDefault();
      const span = row.querySelector('.note-cb-text');
      if (!span?.textContent.trim()) {
        const newDiv = document.createElement('div');
        newDiv.innerHTML = '<br>';
        row.replaceWith(newDiv);
        const range = document.createRange();
        range.setStart(newDiv, 0); range.collapse(true);
        sel.removeAllRanges(); sel.addRange(range);
      } else {
        const newRow = document.createElement('div');
        newRow.className = 'note-checkbox-row';
        newRow.innerHTML = '<input type="checkbox" class="note-cb-input"> <span class="note-cb-text"></span>';
        row.insertAdjacentElement('afterend', newRow);
        const newSpan = newRow.querySelector('.note-cb-text');
        const range = document.createRange();
        range.setStart(newSpan, 0); range.collapse(true);
        sel.removeAllRanges(); sel.addRange(range);
      }
      contentRef.current = editorRef.current?.innerHTML || '';
      scheduleAutoSave(editTitle, editTag, editColor);
      return;
    }

    // ── List row (ul/ol simulated with divs) ──
    const listRow = getEl(node)?.closest('.note-ul-row, .note-ol-row');
    if (listRow) {
      e.preventDefault();
      if (!listRow.textContent.trim()) {
        // Empty row — exit list
        const newDiv = document.createElement('div');
        newDiv.innerHTML = '<br>';
        listRow.replaceWith(newDiv);
        const range = document.createRange();
        range.setStart(newDiv, 0); range.collapse(true);
        sel.removeAllRanges(); sel.addRange(range);
      } else {
        // Continue list
        const type = listRow.getAttribute('data-list-type');
        const newRow = document.createElement('div');
        newRow.className = listRow.className;
        newRow.setAttribute('data-list-type', type);
        if (type === 'ol') {
          const num = parseInt(listRow.getAttribute('data-num') || '1') + 1;
          newRow.setAttribute('data-num', num);
          newRow.setAttribute('data-prefix', num + '. ');
        } else {
          newRow.setAttribute('data-prefix', '• ');
        }
        const textNode = document.createTextNode('');
        newRow.appendChild(textNode);
        listRow.insertAdjacentElement('afterend', newRow);
        const range = document.createRange();
        range.setStart(textNode, 0); range.collapse(true);
        sel.removeAllRanges(); sel.addRange(range);
      }
      contentRef.current = editorRef.current?.innerHTML || '';
      scheduleAutoSave(editTitle, editTag, editColor);
      return;
    }

    // ── Default ──
    setTimeout(() => {
      contentRef.current = editorRef.current?.innerHTML || '';
      scheduleAutoSave(editTitle, editTag, editColor);
    }, 0);
  }

  function fmtDate(str) {
    if (!str) return '';
    const d = new Date(str), now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  const currentColor = NOTE_COLORS.find(c => c.id === editColor) || NOTE_COLORS[0];

  if (!visible) return null;

  return (
    <div className="notes-shell">
      {/* Sidebar */}
      <div className="notes-sidebar">
        <button className="notes-new-btn" onClick={newNote}>+ New note</button>
        <div className="notes-list">
          {notes.length === 0 && <div className="notes-empty">No notes yet.<br />Create your first one!</div>}
          {notes.map(n => {
            const colorId = n.color && n.color !== 'null' ? n.color : 'gold';
            const c = NOTE_COLORS.find(x => x.id === colorId) || NOTE_COLORS[0];
            return (
              <div key={n.id}
                className={`notes-item${selected?.id === n.id ? ' on' : ''}`}
                onClick={() => openNote(n)}
                style={{
                  borderLeftColor: c.border,
                  borderLeftWidth: '3px',
                  borderLeftStyle: 'solid',
                  ...(selected?.id === n.id ? { borderColor: c.border, background: c.bg } : {})
                }}>
                <div className="notes-item-title" style={{ color: c.text }}>
                  {n.title || 'Untitled'}
                </div>
                <div className="notes-item-preview">
                  {(n.content || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 60) || '…'}
                </div>
                <div className="notes-item-footer">
                  <span className={`notes-tag notes-tag-${n.tag}`}>{n.tag}</span>
                  <span className="notes-item-date">{fmtDate(n.updated_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      {selected ? (
        <div className={"notes-editor" + (mobileEditorOpen ? ' mobile-open' : '')}>
          {/* Color header */}
          <div className="notes-editor-header"
            style={{ background: currentColor.bg, borderBottomColor: currentColor.border }}>
            <button className="notes-back-btn" onClick={() => setMobileEditorOpen(false)}>← Back</button>
            <input
              className="notes-title-input"
              style={{ color: currentColor.text }}
              value={editTitle}
              placeholder="Title…"
              onChange={e => {
                setEditTitle(e.target.value);
                scheduleAutoSave(e.target.value, editTag, editColor);
              }}
            />
            <div className="notes-editor-actions">
              <div style={{ position: 'relative' }}>
                <button className="notes-color-btn"
                  style={{ background: currentColor.bg, border: `1.5px solid ${currentColor.border}`, color: currentColor.text }}
                  onMouseDown={e => { e.preventDefault(); setShowColorPicker(p => !p); }}>
                  ● Color
                </button>
                {showColorPicker && (
                  <div className="notes-color-picker">
                    {NOTE_COLORS.map(c => (
                      <div key={c.id}
                        className={`notes-color-dot${editColor === c.id ? ' on' : ''}`}
                        style={{ background: c.bg, border: `2px solid ${c.border}` }}
                        title={c.id}
                        onMouseDown={e => {
                          e.preventDefault();
                          setEditColor(c.id);
                          setShowColorPicker(false);
                          scheduleAutoSave(editTitle, editTag, c.id);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <select className="notes-tag-select" value={editTag}
                onChange={e => { setEditTag(e.target.value); scheduleAutoSave(editTitle, e.target.value, editColor); }}>
                {TAGS.map(tag => <option key={tag} value={tag}>{tag}</option>)}
              </select>
              <button className="notes-save-btn"
                onMouseDown={e => { e.preventDefault(); saveNote(editTitle, editTag, editColor, true); }}>
                {saving ? '…' : 'Save'}
              </button>
              <button className="notes-delete-btn"
                onMouseDown={e => { e.preventDefault(); deleteNote(); }}>
                Delete
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="notes-toolbar">
            <button className="notes-tb-btn" title="Bold" onMouseDown={e => { e.preventDefault(); execCmd('bold'); }}><strong>B</strong></button>
            <button className="notes-tb-btn" title="Italic" onMouseDown={e => { e.preventDefault(); execCmd('italic'); }}><em>I</em></button>
            <button className="notes-tb-btn" title="Underline" onMouseDown={e => { e.preventDefault(); execCmd('underline'); }}><u>U</u></button>
            <button className="notes-tb-btn" title="Strikethrough" onMouseDown={e => { e.preventDefault(); execCmd('strikeThrough'); }}><s>S</s></button>
            <div className="notes-tb-sep" />
            <button className="notes-tb-btn" title="Bullet list" onMouseDown={e => { e.preventDefault(); insertListItem('ul'); }}>—</button>
            <button className="notes-tb-btn" title="Numbered list" onMouseDown={e => { e.preventDefault(); insertListItem('ol'); }}>1.</button>
            <button className="notes-tb-btn" title="Checkbox" onMouseDown={e => { e.preventDefault(); insertCheckbox(); }}>☐</button>
            <div className="notes-tb-sep" />
            <button className="notes-tb-btn" title="Heading 1" onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'h1'); }}>H1</button>
            <button className="notes-tb-btn" title="Heading 2" onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'h2'); }}>H2</button>
            <button className="notes-tb-btn" title="Normal text" onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'div'); }}>¶</button>
          </div>

          {/* Contenteditable editor */}
          <div
            ref={editorRef}
            className="notes-content-editable"
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onKeyDown={handleKeyDown}
            data-placeholder="Write your note here…"
          />
        </div>
      ) : (
        <div className="notes-placeholder">
          <div className="notes-placeholder-text">Select a note or create a new one</div>
        </div>
      )}
    </div>
  );
}
