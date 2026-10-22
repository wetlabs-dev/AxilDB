'use client'
export default function GlobalError() {
  return <html lang="en"><body style={{ margin: '2rem', background: '#fffaf0', color: '#1f2a22', fontFamily: 'system-ui' }}><main role="alert" style={{ maxWidth: '36rem', margin: 'auto' }}>
    <h1>AxilDB could not finish loading</h1><p>The connection may have been interrupted. Check whether your last change was saved before repeating it.</p>
    <button type="button" onClick={() => window.location.reload()} style={{ padding: '.75rem 1rem' }}>Reload AxilDB</button>
  </main></body></html>
}
