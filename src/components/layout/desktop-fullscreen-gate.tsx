'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle } from '@mui/material';

/** Fullscreen requires a user gesture; never attempt to trap the Escape key. */
export function DesktopFullscreenGate() {
  const [required, setRequired] = useState(false);
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    const desktop = matchMedia('(min-width: 1024px) and (pointer: fine)');
    const update = () => setRequired(desktop.matches && !document.fullscreenElement);
    update();
    desktop.addEventListener('change', update);
    document.addEventListener('fullscreenchange', update);
    return () => { desktop.removeEventListener('change', update); document.removeEventListener('fullscreenchange', update); };
  }, []);
  const enter = async () => {
    setError('');
    if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) {
      setUnsupported(true);
      setError('Le plein écran n’est pas disponible dans ce navigateur ou cette fenêtre intégrée. Ouvrez le site dans un onglet de navigateur standard.');
      return;
    }
    try { await document.documentElement.requestFullscreen(); }
    catch { setError('Le navigateur a refusé le plein écran. Autorisez-le puis réessayez.'); }
  };
  return <Dialog open={required} aria-labelledby="desktop-fullscreen-title" aria-describedby="desktop-fullscreen-description" maxWidth="xs" fullWidth sx={{ zIndex: 2000 }}>
    <DialogTitle id="desktop-fullscreen-title">Place à votre équipe</DialogTitle>
    <DialogContent>
      <p id="desktop-fullscreen-description" className="mb-4 text-sm leading-relaxed text-muted">Sur ordinateur, utilisez le site en plein écran pour garder le baromètre, les notes et les commandes bien visibles. Échap permet toujours de quitter ; cette invitation réapparaîtra.</p>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      <Button fullWidth variant="contained" onClick={() => void enter()} sx={{ minHeight: 48 }}>Entrer en plein écran</Button>
      {unsupported && <Button fullWidth onClick={() => setRequired(false)} sx={{ minHeight: 44, mt: 1 }}>Continuer dans ce navigateur incompatible</Button>}
    </DialogContent>
  </Dialog>;
}