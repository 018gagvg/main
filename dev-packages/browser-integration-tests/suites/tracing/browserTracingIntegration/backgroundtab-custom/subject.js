document.getElementById('go-background').addEventListener('click', () => {
  Object.defineProperty(document, 'hidden', { value: true, writable: true });
  const ev = document.createEvent('Event');
  ev.initEvent('visibilitychange');
  document.dispatchEvent(ev);
});

document.getElementById('start-span').addEventListener('click', () => {
  Sentry.withActiveSpan(null, () => {
    Sentry.startSpanManual({ name: 'test-span' }, span => {
      window.span = span;
    });
  });
});

window.getSpanJson = () => {
  return Sentry.spanToJSON(window.span);
};
