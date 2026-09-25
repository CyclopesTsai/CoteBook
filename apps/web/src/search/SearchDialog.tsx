import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSearch } from '../api/queries';
import { SearchIcon } from '../components/icons';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function highlight(text: string, q: string): ReactNode {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const debounced = useDebounced(query.trim(), 200);
  const { data: results = [], isFetching } = useSearch(debounced);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setSelected(0), [debounced]);

  const open = (pageId: string) => {
    onClose();
    navigate(`/p/${pageId}`);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault();
      open(results[selected].pageId);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('sidebar.search')}
      >
        <div className="search-input-row">
          <SearchIcon />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder={t('search.placeholder')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t('search.placeholder')}
          />
          <button type="button" className="button" onClick={onClose}>
            {t('search.close')}
          </button>
        </div>
        {debounced && (
          <ul className="search-results" role="listbox">
            {results.map((r, i) => (
              <li key={r.pageId} style={{ listStyle: 'none' }}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === selected}
                  className={`search-result${i === selected ? ' is-selected' : ''}`}
                  onClick={() => open(r.pageId)}
                  onMouseEnter={() => setSelected(i)}
                >
                  <div className="search-result-title">
                    {highlight(r.title || t('page.untitled'), debounced)}
                  </div>
                  {r.snippet && (
                    <div className="search-result-snippet">{highlight(r.snippet, debounced)}</div>
                  )}
                </button>
              </li>
            ))}
            {!isFetching && results.length === 0 && (
              <li className="search-empty" style={{ listStyle: 'none' }}>
                {t('search.noResults')}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
