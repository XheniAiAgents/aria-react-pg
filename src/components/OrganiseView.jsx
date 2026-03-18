import { useState } from 'react';
import TasksView from './TasksView';
import NotesView from './NotesView';

export default function OrganiseView({ API, userId, visible, showToast, t }) {
  const [subtab, setSubtab] = useState('tasks');

  if (!visible) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="organise-tabs">
        <div
          className={`organise-tab${subtab === 'tasks' ? ' on' : ''}`}
          onClick={() => setSubtab('tasks')}
        >
          {t('tasks')}
        </div>
        <div
          className={`organise-tab${subtab === 'notes' ? ' on' : ''}`}
          onClick={() => setSubtab('notes')}
        >
          Notes
        </div>
      </div>

      <TasksView
        API={API} userId={userId}
        visible={subtab === 'tasks'}
        showToast={showToast} t={t}
      />
      <NotesView
        API={API} userId={userId}
        visible={subtab === 'notes'}
        showToast={showToast} t={t}
      />
    </div>
  );
}
