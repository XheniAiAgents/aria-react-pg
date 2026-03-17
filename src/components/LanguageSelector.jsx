export default function LanguageSelector({ lang, onSetLang }) {
  const langs = [
    { code: 'en', label: 'EN' },
    { code: 'es', label: 'ES' },
    { code: 'sq', label: 'SQ' },
  ];

  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ghost)', marginBottom: '8px' }}>
        Language / Idioma / Gjuha
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {langs.map(l => (
          <button
            key={l.code}
            onClick={() => onSetLang(l.code)}
            style={{
              flex: 1, padding: '7px', borderRadius: '7px',
              border: `1px solid ${lang === l.code ? 'var(--a1)' : 'var(--trace)'}`,
              background: lang === l.code ? 'var(--a1)' : 'var(--raised)',
              color: lang === l.code ? 'white' : 'var(--mist)',
              fontSize: '11px', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.2s',
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
