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

  // Run synchronously now in case the element is already laid out…
  adjust();
  // …after this frame's layout pass…
  const raf1 = requestAnimationFrame(() => {
    adjust();
    // …and once more on the following frame, because iOS WebView and
    // some Chromium versions don't always have nested-positioned
    // children fully resolved by the first rAF callback.
    requestAnimationFrame(adjust);
  });
  // …and a safety net after styles + fonts have all settled.
  const timeout = window.setTimeout(adjust, 100);

  const ro = new ResizeObserver(adjust);
  ro.observe(node);
  window.addEventListener('resize', adjust);

  return {
    destroy() {
      cancelAnimationFrame(raf1);
      clearTimeout(timeout);
      ro.disconnect();
      window.removeEventListener('resize', adjust);
    }
  };
}
