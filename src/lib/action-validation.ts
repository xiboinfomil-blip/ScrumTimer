/** Returns a French error, or null. Valid names must be trimmed by the caller. */
export function validatePersonName(value: unknown): string | null {
  if (typeof value !== 'string') return 'Le nom doit être du texte.';
  // Check the original input: trim must not hide tabs, newlines or other controls.
  if (/\p{Cc}/u.test(value)) return 'Le nom ne doit pas contenir de caractères de contrôle.';
  const name = value.trim();
  if (!name) return 'Saisissez un nom.';
  if (name.length > 60) return 'Le nom ne doit pas dépasser 60 caractères.';
  return null;
}