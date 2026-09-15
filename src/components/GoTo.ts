/**
 * Going to another address of the same list, reliably.
 *
 * Opening the side panel, walking to the next record and closing it again are
 * all the same page with a different query string. The app router occasionally
 * fetches such a page and then declines to show it, which leaves a key press or
 * a click doing nothing at all: the worst thing a list can do to somebody
 * working quickly.
 *
 * So the router is asked first, because when it works it is instant, and if the
 * address has not actually changed a moment later the browser is told to go
 * there itself. The person always ends up where they asked to be; the only
 * difference is whether it took a frame or a page load.
 */
export function goTo(router: { push: (href: string) => void }, href: string, after = 400): void {
  const before = window.location.pathname + window.location.search;
  if (href === before) return;

  router.push(href);

  window.setTimeout(() => {
    const now = window.location.pathname + window.location.search;
    if (now === before) window.location.assign(href);
  }, after);
}
