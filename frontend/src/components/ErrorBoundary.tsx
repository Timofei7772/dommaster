import React from 'react'
import { Link } from 'react-router-dom'
import { Home, RefreshCw } from 'lucide-react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center max-w-lg">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Произошла ошибка</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {this.state.error?.message || 'Неизвестная ошибка'}
            </p>
            <pre className="text-xs text-left bg-slate-100 dark:bg-slate-800 p-4 rounded mb-6 overflow-auto max-h-40">
              {this.state.error?.stack}
            </pre>
            <div className="flex gap-4 justify-center">
              <Link to="/estimates" className="btn-primary flex items-center gap-2">
                <Home className="w-4 h-4" />К сметам
              </Link>
              <button 
                onClick={() => window.location.reload()} 
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />Перезагрузить
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
