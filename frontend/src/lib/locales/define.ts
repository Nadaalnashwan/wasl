/** Typed helper: the Arabic dictionary must cover every English key. */
export function defineMessages<E extends Record<string, string>>(en: E, ar: { [K in keyof E]: string }) {
  return { en, ar };
}
