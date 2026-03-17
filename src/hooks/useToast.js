import { useState, useCallback, useRef } from 'react';

export function useToast() {
  const [toast, setToast] = useState({ visible: false, message: '', error: false });
  const timerRef = useRef(null);

  const showToast = useCallback((message, error = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ visible: true, message, error });
    timerRef.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  }, []);

  return { toast, showToast };
}
