import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  reloading: boolean;
}

// Detects Safari "Load failed", Chrome "Loading chunk X failed", Firefox dynamic import errors
function isChunkLoadError(err: Error): boolean {
  return (
    /loading chunk/i.test(err.message) ||
    /load failed/i.test(err.message) ||
    /failed to fetch dynamically imported module/i.test(err.message) ||
    /error loading dynamically imported module/i.test(err.message) ||
    (err.name === 'ChunkLoadError')
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);

    // Stale PWA cache — chunk hashes changed after a deploy.
    // Force a hard reload once; the browser will fetch fresh index.html + chunks.
    if (isChunkLoadError(error)) {
      const reloadKey = 'chunk_error_reload';
      const lastReload = Number(sessionStorage.getItem(reloadKey) ?? 0);
      const now = Date.now();
      // Only auto-reload once per session to avoid infinite loops
      if (now - lastReload > 10_000) {
        sessionStorage.setItem(reloadKey, String(now));
        this.setState({ reloading: true });
        window.location.reload();
      }
    }
  }

  handleReset = () => {
    this.setState({ error: null, reloading: false });
    window.location.href = '/';
  };

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    if (reloading || isChunkLoadError(error)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="text-center">
            <div className="text-4xl mb-4">🐴</div>
            <p className="text-sm text-gray-500">Updating app, please wait…</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-4">🐴</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500 mb-6">
            An unexpected error occurred. Your data is safe — try reloading the page.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-left text-xs bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-red-700 overflow-auto max-h-40 whitespace-pre-wrap">
              {error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
