import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'Error inesperado en la aplicación.',
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Runtime error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'Inter, sans-serif', color: '#0f172a' }}>
          <h2 style={{ marginTop: 0 }}>Ocurrió un error de ejecución</h2>
          <p style={{ marginBottom: '0.5rem' }}>
            La pantalla quedó en blanco por un error en tiempo real. Revisá la consola del navegador para más detalle.
          </p>
          <p style={{ margin: 0, color: '#64748b' }}>{this.state.errorMessage}</p>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
