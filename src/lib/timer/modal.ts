export function visibleModalDialogs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], dialog[open]')].filter(modal => {
    const style = getComputedStyle(modal);
    return style.visibility !== 'hidden' && style.display !== 'none' && modal.getClientRects().length > 0
      && !modal.closest('[aria-hidden="true"]');
  });
}