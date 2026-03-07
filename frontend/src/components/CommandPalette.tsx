import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Search, Horse, BookOpen, MapPin, Tag, Loader2 } from 'lucide-react';

interface HorseResult {
  id: string;
  name: string;
  breed: string | null;
  stableLocation: string | null;
  photoUrl: string | null;
}

interface ProgrammeResult {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
}

interface SearchResults {
  horses: HorseResult[];
  programmes: ProgrammeResult[];
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type ResultItem =
  | { kind: 'horse'; data: HorseResult }
  | { kind: 'programme'; data: ProgrammeResult };

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ horses: [], programmes: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedQuery = useDebounce(query, 250);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({ horses: [], programmes: [] });
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Fetch results when query changes
  useEffect(() => {
    if (!open) return;
    if (debouncedQuery.trim().length === 0) {
      setResults({ horses: [], programmes: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    api<SearchResults>(`/search?q=${encodeURIComponent(debouncedQuery.trim())}`)
      .then((data) => {
        setResults(data);
        setActiveIndex(0);
      })
      .catch(() => setResults({ horses: [], programmes: [] }))
      .finally(() => setLoading(false));
  }, [debouncedQuery, open]);

  // Flat list of all results for keyboard navigation
  const flatResults: ResultItem[] = [
    ...results.horses.map((h): ResultItem => ({ kind: 'horse', data: h })),
    ...results.programmes.map((p): ResultItem => ({ kind: 'programme', data: p })),
  ];

  const navigateTo = useCallback(
    (item: ResultItem) => {
      if (item.kind === 'horse') {
        navigate(`/horses/${item.data.id}`);
      } else {
        navigate('/programmes');
      }
      onClose();
    },
    [navigate, onClose]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      navigateTo(flatResults[activeIndex]);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const hasResults = results.horses.length > 0 || results.programmes.length > 0;
  const showEmpty = !loading && debouncedQuery.trim().length > 0 && !hasResults;

  // Running index across both groups for keyboard nav
  let runningIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b">
          {loading
            ? <Loader2 className="w-5 h-5 text-gray-400 shrink-0 animate-spin" />
            : <Search className="w-5 h-5 text-gray-400 shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search horses, programmes…"
            className="flex-1 text-base outline-none bg-transparent text-gray-900 placeholder-gray-400"
          />
          <kbd className="hidden sm:flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">

          {/* Idle state — no query yet */}
          {!loading && debouncedQuery.trim().length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">
              Start typing to search horses and programmes
            </div>
          )}

          {/* No results */}
          {showEmpty && (
            <div className="py-10 text-center text-sm text-gray-400">
              No results for <span className="font-medium text-gray-600">"{debouncedQuery}"</span>
            </div>
          )}

          {/* Horses group */}
          {results.horses.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Horses
              </div>
              {results.horses.map((horse) => {
                const idx = runningIndex++;
                const active = activeIndex === idx;
                return (
                  <button
                    key={horse.id}
                    data-index={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => navigateTo({ kind: 'horse', data: horse })}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      active ? 'bg-brand-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {horse.photoUrl ? (
                      <img
                        src={horse.photoUrl}
                        alt={horse.name}
                        className="w-9 h-9 rounded-lg object-cover border shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-gray-100 border flex items-center justify-center shrink-0">
                        <Horse className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium truncate ${active ? 'text-brand-700' : 'text-gray-900'}`}>
                        {horse.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {horse.breed && (
                          <span className="flex items-center gap-1 text-xs text-gray-400 truncate">
                            <Tag className="w-3 h-3" />{horse.breed}
                          </span>
                        )}
                        {horse.stableLocation && (
                          <span className="flex items-center gap-1 text-xs text-gray-400 truncate">
                            <MapPin className="w-3 h-3" />{horse.stableLocation}
                          </span>
                        )}
                      </div>
                    </div>
                    {active && (
                      <kbd className="hidden sm:block text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono shrink-0">
                        ↵
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Programmes group */}
          {results.programmes.length > 0 && (
            <div className={results.horses.length > 0 ? 'border-t' : ''}>
              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Programmes
              </div>
              {results.programmes.map((programme) => {
                const idx = runningIndex++;
                const active = activeIndex === idx;
                return (
                  <button
                    key={programme.id}
                    data-index={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => navigateTo({ kind: 'programme', data: programme })}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      active ? 'bg-brand-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4 text-brand-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium truncate ${active ? 'text-brand-700' : 'text-gray-900'}`}>
                        {programme.name}
                      </div>
                      {programme.description && (
                        <div className="text-xs text-gray-400 truncate mt-0.5">
                          {programme.description}
                        </div>
                      )}
                    </div>
                    {active && (
                      <kbd className="hidden sm:block text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono shrink-0">
                        ↵
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer hint */}
          {hasResults && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t bg-gray-50 text-xs text-gray-400">
              <span>
                <kbd className="bg-white border rounded px-1 font-mono">↑</kbd>{' '}
                <kbd className="bg-white border rounded px-1 font-mono">↓</kbd>{' '}
                to navigate
              </span>
              <span>
                <kbd className="bg-white border rounded px-1 font-mono">↵</kbd>{' '}
                to open &nbsp;·&nbsp;{' '}
                <kbd className="bg-white border rounded px-1 font-mono">esc</kbd>{' '}
                to close
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
