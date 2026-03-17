# ARIA React

ARIA v2 frontend, fully converted from plain HTML/JS to React + Vite.

## Structure

```
src/
├── App.jsx              # Root: auth state, theme, login/logout
├── App.css              # All design tokens + global styles
├── main.jsx             # Vite entry point
├── components/
│   ├── AppShell.jsx     # Main layout coordinator
│   ├── AuthScreen.jsx   # Login / Register
│   ├── ResetScreen.jsx  # Forgot / Reset password
│   ├── ChatView.jsx     # Chat with ARIA
│   ├── TasksView.jsx    # Tasks list + add form
│   ├── CalendarView.jsx # Month calendar + events
│   ├── EmailView.jsx    # Gmail inbox + AI summary
│   ├── EventModal.jsx   # Add event modal
│   ├── LeftPanel.jsx    # Profile, mode switch, memories
│   ├── RightPanel.jsx   # Tasks/events sidebar + stats
│   ├── Rail.jsx         # Desktop icon rail + notif panel
│   ├── NotifPanel.jsx   # Notification panel (desktop + mobile sheet)
│   ├── SettingsPanel.jsx# Settings (desktop panel + mobile sheet)
│   ├── MobileHeader.jsx # Mobile top bar
│   ├── MobileNav.jsx    # Mobile bottom nav
│   └── Toast.jsx        # Toast notification
├── hooks/
│   ├── useToast.js      # Toast state
│   ├── useTheme.js      # Light/dark theme
│   ├── useReminders.js  # Reminder polling + notification firing
│   └── useGmail.js      # Gmail/digest state
└── utils/
    └── helpers.js       # esc, fmt, fmtDate, formatProfileDate, etc.
```

## Setup

```bash
npm install
npm run dev
```

Backend must be running on `http://127.0.0.1:8000` (same as original).

## Notes

- The `API` base URL is set in `App.jsx` — change it to match your backend.
- `manifest.json`, `sw.js`, and `icons/` should be placed in the `public/` folder.
- All original functionality is preserved: auth, chat, tasks, calendar, email digest, Gmail OAuth, Telegram link, notifications, reminders, dark/light theme, Work/Life mode.
