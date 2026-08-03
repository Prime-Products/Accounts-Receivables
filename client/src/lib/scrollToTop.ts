/**
 * Sends the page back to the top.
 *
 * The dashboard scrolls the window, but a few pages (invoice tables, the group
 * card) put their own overflow container in the middle of the layout, so both
 * the window and any scrolled element inside <main> are reset. Motion is skipped
 * for users who asked for reduced motion, and for long jumps where a smooth
 * scroll of several thousand pixels would just feel slow.
 */
export function scrollPageToTop() {
  if (typeof window === "undefined") return;

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const behavior: ScrollBehavior = reduced || window.scrollY > 2000 ? "auto" : "smooth";

  window.scrollTo({ top: 0, behavior });
  // Some browsers scroll the documentElement rather than the window object.
  document.documentElement.scrollTop = 0;

  const main = document.querySelector("main [data-scroll-container], main");
  if (main instanceof HTMLElement && main.scrollTop > 0) {
    main.scrollTo({ top: 0, behavior });
  }
}
