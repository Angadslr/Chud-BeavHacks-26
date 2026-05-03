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
            background: '#ebe6dd',
            color: '#57534e',
            padding: 24,
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          }}
        >
          <h1
            style={{
              color: '#1c1917',
              marginTop: 0,
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: '1.5rem',
              fontWeight: 600,
            }}
          >
            Something broke
          </h1>
          <p style={{ color: '#78716c', maxWidth: 560, fontSize: 15, lineHeight: 1.55 }}>
            Open the developer console for the stack trace. If you just cloned the repo,
            run from <code style={{ color: '#0f766e' }}>aux-wars</code> and confirm{' '}
            <code style={{ color: '#0f766e' }}>.env</code> has your Firebase keys.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: '#fffcf7',
              color: '#292524',
              border: '1px solid #d4cdc3',
              overflow: 'auto',
              fontSize: 13,
              borderRadius: 6,
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
