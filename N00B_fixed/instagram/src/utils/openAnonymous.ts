// The "Send me anonymous messages" button on a story opens the Anonymous Messages page. The story can be on the home page, on someone's profile (a highlight), anywhere:
// it only says "open it", and the app (which closes the story and goes home) and the home page (which shows the page) each do their part.
export const OPEN_ANONYMOUS_EVENT = 'noob:open-anonymous';

export function requestOpenAnonymousMessages(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_ANONYMOUS_EVENT));
}
