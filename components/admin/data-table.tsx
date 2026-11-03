'use client';

// The one table every admin list uses: a header row, one line per record, an empty message, and an optional pager.
// Screens only describe their columns; spacing, hover and the narrow-screen scroll live here and in app/admin.css.
import { useState, type ReactNode } from 'react';
import { PAGE_SIZE } from '@/lib/admin';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-align amounts and buttons. */
  align?: 'right';
  /** Fixed width, e.g. '8rem'. With any width set the table uses a fixed layout, so stacked tables line up. */
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Shown when there are no rows and nothing is loading. */
  empty: string;
  /** Makes rows clickable. `selectedKey` marks the open one. */
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
}

export function DataTable<T>({ columns, rows, rowKey, loading, empty, onRowClick, selectedKey }: TableProps<T>) {
  const cls = (c: Column<T>) => (c.align === 'right' ? 'adm-right' : undefined);
  return (
    <div className="adm-table-wrap">
      <table className="adm-table" style={columns.some((c) => c.width) ? { tableLayout: 'fixed' } : undefined}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header || 'actions'} className={cls(c)} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={onRowClick ? 'adm-row-click' : undefined}
                aria-selected={onRowClick ? selectedKey === key : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick && (() => onRowClick(row))}
                onKeyDown={onRowClick && ((e) => e.key === 'Enter' && onRowClick(row))}
              >
                {columns.map((c) => (
                  <td key={c.header || 'actions'} className={cls(c)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!loading && rows.length === 0 && <p className="adm-empty">{empty}</p>}
    </div>
  );
}

/** Page number and page size for a list. Changing the size goes back to the first page. */
export function usePaging(initialSize: number = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const [size, setSizeState] = useState(initialSize);
  return {
    page,
    size,
    setPage,
    setSize: (n: number) => {
      setSizeState(n);
      setPage(0);
    },
    reset: () => setPage(0),
  };
}

const SIZES = [10, 25, 50, 100];

interface PagerProps {
  page: number;
  total: number;
  /** Rows per page */
  size: number;
  /** [singular, plural], e.g. ['payment', 'payments'] */
  noun: [string, string];
  loading?: boolean;
  onPage: (page: number) => void;
  /** Shows the "per page" choice when given. */
  onSize?: (size: number) => void;
}

export function Pager({ page, total, size, noun, loading, onPage, onSize }: PagerProps) {
  const pages = Math.max(1, Math.ceil(total / size));
  const first = total === 0 ? 0 : page * size + 1;
  const last = Math.min(total, (page + 1) * size);
  return (
    <div className="adm-pager">
      <span>
        {total === 0 ? `0 ${noun[1]}` : `${first}–${last} of ${total} ${total === 1 ? noun[0] : noun[1]}`}
        {loading ? ' · loading…' : ''}
      </span>
      <div className="adm-toolbar">
        {onSize && (
          <label className="adm-per-page">
            <span>Per page</span>
            <select className="adm-select" value={size} onChange={(e) => onSize(Number(e.target.value))}>
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="adm-btn adm-btn-sm" disabled={page === 0} onClick={() => onPage(0)}>
          First
        </button>
        <button type="button" className="adm-btn adm-btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <button
          type="button"
          className="adm-btn adm-btn-sm"
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-sm"
          disabled={page + 1 >= pages}
          onClick={() => onPage(pages - 1)}
        >
          Last
        </button>
      </div>
    </div>
  );
}
