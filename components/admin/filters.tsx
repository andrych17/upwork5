'use client';

// The filters above an admin table. Every list builds its bar from these, so tabs, selects, dates and search
// look and behave the same everywhere. Each one only reports a change; the screen decides what to query.
import { useState, type ReactNode } from 'react';

interface Option<T extends string> {
  key: T;
  label: string;
}

export function FilterBar({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  return (
    <div className="adm-filters">
      {children}
      {onReset && (
        <button type="button" className="adm-btn adm-btn-sm" onClick={onReset}>
          Reset filters
        </button>
      )}
    </div>
  );
}

export function TabFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="adm-tabs" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SelectFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="adm-field adm-filter">
      <span>{label}</span>
      <select className="adm-select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Two day pickers. Values are "YYYY-MM-DD" or "" for open-ended. */
export function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <>
      <label className="adm-field adm-filter">
        <span>From</span>
        <input
          className="adm-input"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onChange(e.target.value, to)}
        />
      </label>
      <label className="adm-field adm-filter">
        <span>To</span>
        <input
          className="adm-input"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onChange(from, e.target.value)}
        />
      </label>
    </>
  );
}

/** Search on Enter or the button. `value` is what is applied now, so the box clears when a screen resets filters. */
export function SearchBox({
  label,
  placeholder,
  value,
  onSearch,
}: {
  label: string;
  placeholder: string;
  value: string;
  onSearch: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  // Follow the applied value when a screen resets it from outside.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  return (
    <form
      className="adm-toolbar"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(text.trim());
      }}
    >
      <input
        className="adm-input"
        type="search"
        placeholder={placeholder}
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="adm-btn">
        Search
      </button>
    </form>
  );
}
