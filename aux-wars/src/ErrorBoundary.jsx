import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const e = this.state.error
      return (
        <div
          style={{
            minHeight: '100vh',
            boxSizing: 'border-box',
            background: '#0d0d0f',
            color: '#fda4af',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ color: '#fff', marginTop: 0 }}>Aux Wars — runtime error</h1>
          <p style={{ color: '#e8e8ed', maxWidth: 560 }}>
            Open the browser dev console (F12 → Console) for details. Common fix:
            use <code style={{ color: '#7dd3fc' }}>npm run dev</code> from the{' '}
            <code style={{ color: '#7dd3fc' }}>aux-wars</code> folder and fill{' '}
            <code style={{ color: '#7dd3fc' }}>.env</code> with Firebase + YouTube keys.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: '#161618',
              color: '#e8e8ed',
              overflow: 'auto',
              fontSize: 13,
              borderRadius: 8,
            }}
          >
            {String(e?.message || e)}
            {e?.stack ? `\n\n${e.stack}` : ''}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
