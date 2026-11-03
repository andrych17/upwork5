// Rules for choosing a new password (the change-password form and its check in scripts/test-password.ts).
export const MIN_PASSWORD = 8;

/** The first problem with the typed passwords, or '' when they can be sent. */
export function passwordProblem(current: string, next: string, again: string, needCurrent: boolean): string {
  if (needCurrent && !current) return 'Enter your current password.';
  if (next.length < MIN_PASSWORD) return `The new password needs at least ${MIN_PASSWORD} characters.`;
  if (next !== again) return 'The two new passwords are not the same.';
  if (needCurrent && next === current) return 'Choose a password different from your current one.';
  return '';
}
