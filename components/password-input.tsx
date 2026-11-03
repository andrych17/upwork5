'use client';

// A password field with an eye button to show or hide what is typed. Takes the same props as <input>
// (except type), so every password box on the site can swap to it. Styles: .pw-field in app/globals.css.
import { useState, type InputHTMLAttributes } from 'react';

const icon = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export default function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pw-field">
      <input
        {...props}
        className={className ? `${className} pw-input` : 'pw-input'}
        type={shown ? 'text' : 'password'}
      />
      <button
        type="button"
        className="pw-toggle"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
      >
        {shown ? (
          <svg {...icon}>
            <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.4 10.4 0 0 1 12 5c5 0 8.5 4 9.5 7a11.7 11.7 0 0 1-3 4.3M6.3 6.3A11.7 11.7 0 0 0 2.5 12c1 3 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.2" />
          </svg>
        ) : (
          <svg {...icon}>
            <path d="M2.5 12C3.5 9 7 5 12 5s8.5 4 9.5 7c-1 3-4.5 7-9.5 7s-8.5-4-9.5-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}
