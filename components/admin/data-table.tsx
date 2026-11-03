'use client';

// The one table every admin list uses: a header row, one line per record, an empty message, and an optional pager.
// Screens only describe their columns; spacing, hover and the narrow-screen scroll live here and in app/admin.css.
import type { ReactNode } from 'react';

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

interface PagerProps {
  page: number;
  pages: number;
  total: number;
  /** [singular, plural], e.g. ['payment', 'payments'] */
  noun: [string, string];
  loading?: boolean;
  onPage: (page: number) => void;
}

export function Pager({ page, pages, total, noun, loading, onPage }: PagerProps) {
  return (
    <div className="adm-pager">
      <span>
        {total} {total === 1 ? noun[0] : noun[1]}
        {loading ? ' · loading…' : ''}
      </span>
      <div className="adm-toolbar">
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
      </div>
    </div>
  );
}
