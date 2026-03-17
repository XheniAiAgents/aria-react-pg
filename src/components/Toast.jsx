export default function Toast({ toast }) {
  return (
    <div className={`toast${toast.visible ? ' show' : ''}${toast.error ? ' err' : ''}`}>
      {toast.message}
    </div>
  );
}
