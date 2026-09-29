/**
 * Poki : afficher les contrôles tactiles sur mobile ET tablette (y compris
 * les iPad qui se présentent comme des Mac), et les instructions clavier sur desktop.
 */
function detectTouchDevice(): boolean {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua)) return true;
  // iPadOS 13+ se déclare "Macintosh" mais a des points de contact.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

export const device = {
  isTouch: detectTouchDevice(),
};
