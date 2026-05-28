/**
 * Svelte action that horizontally translates an absolutely-positioned
 * element so it stays inside the viewport. Re-measures on element
 * resize and window resize.
 *
 * Usage:
 *   <div use:keepInViewport class="absolute …">…</div>
 *
 * Limitations: horizontal only (we haven't seen vertical overflow in
 * practice). Sets `transform: translateX(…)` so the consumer must
 * not also use translate.
 */
export function keepInViewport(node: HTMLElement) {
  function adjust(): void {
    node.style.transform = '';
    const rect = node.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 8;
    let dx = 0;
    if (rect.right > vw - margin) {
      dx = vw - margin - rect.right;
    } else if (rect.left < margin) {
      dx = margin - rect.left;
    }
    if (dx !== 0) {
      node.style.transform = `translateX(${dx}px)`;
    }
  }

  // Run after layout settles.
  const raf = requestAnimationFrame(adjust);
  const ro = new ResizeObserver(adjust);
  ro.observe(node);
  window.addEventListener('resize', adjust);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', adjust);
    }
  };
}
