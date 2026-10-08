import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Erro inesperado na tela', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-dvh bg-zinc-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-100 shadow-sm p-8 text-center space-y-4">
          <div className="inline-flex p-4 bg-amber-100 text-amber-600 rounded-3xl">
            <AlertTriangle size={40} strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Ops! Algo deu errado nesta tela.</h1>
          <p className="text-zinc-500">
            Não se preocupe: toque em Recarregar para continuar.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl font-medium bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <RefreshCw size={20} /> Recarregar
          </button>
        </div>
      </div>
    );
  }
}
