import { useState, useCallback } from 'react';

const TRANSLATIONS = {
  en: {
    chat: 'Chat', tasks: 'Tasks', calendar: 'Calendar', email: 'Email', alerts: 'Alerts',
    addTask: 'Add task', addEvent: 'Add event', pending: 'Pending',
    noTasks: 'No pending tasks. Ask ARIA or add one above.',
    upcomingTasks: 'Upcoming tasks', todayEvents: "Today's events", today: 'Today',
    messages: 'Messages', context: 'Context', signOut: 'Sign out',
    changePassword: 'Change password', lightMode: 'Light mode',
    connectGmail: 'Connect Gmail', emailDigest: 'Email Digest',
    noEvents: 'No events. Click a day or add one above.',
    noUpcoming: 'No upcoming events.', noScheduled: 'Nothing scheduled.',
    talkToAria: 'Talk to ARIA…', send: '↵ send · shift+↵ newline',
    work: 'Work', dailyLife: 'Daily Life', online: 'Online',
    ariaKnows: 'ARIA knows', startChatting: 'Start chatting — ARIA will learn about you.',
    personalIntelligence: 'Personal Intelligence',
    notificationsTitle: 'Notifications', clearAll: 'clear all', noNotifs: 'No notifications yet.',
    askAria: 'Ask ARIA about your emails…',
    noPendingTasks: 'No pending tasks.', nothingScheduled: 'Nothing scheduled.',
    signIn: 'Sign in', createAccount: 'Create account', forgotPassword: 'Forgot password?',
    connectTelegram: 'Connect Telegram',
  },
  es: {
    chat: 'Chat', tasks: 'Tareas', calendar: 'Calendario', email: 'Correo', alerts: 'Alertas',
    addTask: 'Añadir tarea', addEvent: 'Añadir evento', pending: 'Pendiente',
    noTasks: 'Sin tareas pendientes. Pregunta a ARIA o añade una arriba.',
    upcomingTasks: 'Próximas tareas', todayEvents: 'Eventos de hoy', today: 'Hoy',
    messages: 'Mensajes', context: 'Contexto', signOut: 'Cerrar sesión',
    changePassword: 'Cambiar contraseña', lightMode: 'Modo claro',
    connectGmail: 'Conectar Gmail', emailDigest: 'Resumen de correo',
    noEvents: 'Sin eventos. Haz clic en un día o añade uno arriba.',
    noUpcoming: 'Sin próximos eventos.', noScheduled: 'Nada programado.',
    talkToAria: 'Habla con ARIA…', send: '↵ enviar · shift+↵ nueva línea',
    work: 'Trabajo', dailyLife: 'Vida diaria', online: 'En línea',
    ariaKnows: 'ARIA sabe', startChatting: 'Empieza a chatear — ARIA aprenderá sobre ti.',
    personalIntelligence: 'Inteligencia Personal',
    notificationsTitle: 'Notificaciones', clearAll: 'borrar todo', noNotifs: 'Sin notificaciones aún.',
    askAria: 'Pregunta a ARIA sobre tus correos…',
    noPendingTasks: 'Sin tareas pendientes.', nothingScheduled: 'Nada programado.',
    signIn: 'Iniciar sesión', createAccount: 'Crear cuenta', forgotPassword: '¿Olvidaste tu contraseña?',
    connectTelegram: 'Conectar Telegram',
  },
  sq: {
    chat: 'Bisedë', tasks: 'Detyra', calendar: 'Kalendar', email: 'Email', alerts: 'Sinjalizime',
    addTask: 'Shto detyrë', addEvent: 'Shto ngjarje', pending: 'Në pritje',
    noTasks: 'Nuk ka detyra. Pyet ARIA-n ose shto një sipër.',
    upcomingTasks: 'Detyrat e ardhshme', todayEvents: 'Ngjarjet e sotme', today: 'Sot',
    messages: 'Mesazhe', context: 'Kontekst', signOut: 'Dilni',
    changePassword: 'Ndrysho fjalëkalimin', lightMode: 'Modalitet i çelët',
    connectGmail: 'Lidhu me Gmail', emailDigest: 'Përmbledhje emaili',
    noEvents: 'Nuk ka ngjarje. Kliko një ditë ose shto një sipër.',
    noUpcoming: 'Nuk ka ngjarje të ardhshme.', noScheduled: 'Asgjë e planifikuar.',
    talkToAria: 'Fol me ARIA-n…', send: '↵ dërgo · shift+↵ rresht i ri',
    work: 'Punë', dailyLife: 'Jeta e përditshme', online: 'Në linjë',
    ariaKnows: 'ARIA di', startChatting: 'Fillo të bisedosh — ARIA do të mësojë për ty.',
    personalIntelligence: 'Inteligjencë Personale',
    notificationsTitle: 'Njoftime', clearAll: 'fshi të gjitha', noNotifs: 'Nuk ka njoftime ende.',
    askAria: 'Pyet ARIA-n për emailet tuaja…',
    noPendingTasks: 'Nuk ka detyra në pritje.', nothingScheduled: 'Asgjë e planifikuar.',
    signIn: 'Hyr', createAccount: 'Krijo llogari', forgotPassword: 'Harrove fjalëkalimin?',
    connectTelegram: 'Lidhu me Telegram',
  }
};

export function useLanguage() {
  const [lang, setLangState] = useState(() => localStorage.getItem('aria_lang') || 'en');

  const setLang = useCallback((newLang) => {
    setLangState(newLang);
    localStorage.setItem('aria_lang', newLang);
  }, []);

  const t = useCallback((key) => {
    return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;
  }, [lang]);

  return { lang, setLang, t };
}
