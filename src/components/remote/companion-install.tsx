'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel } from '@mui/material';
import { primaryButton } from '@/components/ui/styles';

// This non-sensitive UI preference is deliberately separate from team pairing.
const INSTALL_PREFERENCE_KEY = 'standup.companion.install.hidden.v1';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Mount on the remote page; its parent supplies the manifest metadata. */
export function CompanionInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [workerError, setWorkerError] = useState('');
  const [secure, setSecure] = useState(true);
  const [open, setOpen] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [storageError, setStorageError] = useState('');
  const mounted = useRef(false);
  const installedRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const isStandalone = () => displayMode.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const syncDisplayMode = () => {
      installedRef.current = isStandalone();
      setInstalled(installedRef.current);
      if (installedRef.current) {
        setDeferredPrompt(null);
        setOpen(false);
      }
    };
    const beforeInstall = (event: Event) => {
      if (installedRef.current || isStandalone()) return;
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      setMessage('');
    };
    const appInstalled = () => {
      installedRef.current = true;
      setInstalled(true);
      setOpen(false);
      setDeferredPrompt(null);
      setMessage('');
    };

    syncDisplayMode();
    let hidden = false;
    try {
      hidden = window.localStorage.getItem(INSTALL_PREFERENCE_KEY) === 'true';
    } catch {
      setStorageError('Le stockage est indisponible : votre préférence reste valable pour cette page uniquement. La proposition pourra réapparaître au prochain chargement.');
    }
    setDoNotShowAgain(hidden);
    setOpen(!isStandalone() && !hidden);
    setSecure(window.isSecureContext);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    displayMode.addEventListener('change', syncDisplayMode);

    // Registration is not proof of installation. Never persist pairing data here.
    if (window.isSecureContext && 'serviceWorker' in navigator) {
      void (async () => {
        try {
          await navigator.serviceWorker.register('/remote/sw.js', {
            scope: '/remote',
            updateViaCache: 'none',
          });
        } catch {
          if (mounted.current) {
            setWorkerError('La préparation de l’application a échoué. La télécommande reste accessible dans le navigateur ; réessayez en rechargeant la page.');
          }
        }
      })();
    }

    return () => {
      mounted.current = false;
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
      displayMode.removeEventListener('change', syncDisplayMode);
    };
  }, []);

  function updatePreference(hidden: boolean) {
    setDoNotShowAgain(hidden);
    try {
      if (hidden) window.localStorage.setItem(INSTALL_PREFERENCE_KEY, 'true');
      else window.localStorage.removeItem(INSTALL_PREFERENCE_KEY);
      setStorageError('');
    } catch {
      setStorageError('Le stockage est indisponible : votre préférence reste valable pour cette page uniquement. La proposition pourra réapparaître au prochain chargement.');
    }
  }

  async function install() {
    if (!deferredPrompt || pending || installed) return;
    const prompt = deferredPrompt;
    setPending(true);
    setMessage('');
    try {
      // Keep this call directly in the user's click gesture.
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (mounted.current) {
        setMessage(choice.outcome === 'accepted'
          ? 'Demande d’installation acceptée par le navigateur.'
          : 'Installation annulée. Vous pouvez continuer dans le navigateur.');
      }
    } catch {
      if (mounted.current) setMessage('L’installation n’a pas abouti. Essayez depuis le menu du navigateur.');
    } finally {
      if (mounted.current) {
        setDeferredPrompt(null);
        setPending(false);
      }
    }
  }

  if (installed && !workerError && !storageError) return null;

  return (
    <aside aria-label="Installer la télécommande" className="rounded-2xl border border-slate-200/80 bg-white p-3 text-xs text-slate-600">
      {!installed && (
        <>
          <Button size="small" onClick={() => setOpen(true)} aria-haspopup="dialog"
            aria-controls={open ? 'companion-install-dialog' : undefined}
            className="text-brand" sx={{ minHeight: 44, minWidth: 44, textTransform: 'none' }}>
            Ajouter l’application
          </Button>
          <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"
            aria-labelledby="companion-install-title" aria-describedby="companion-install-description"
            slotProps={{ paper: { id: 'companion-install-dialog' } }}>
            <DialogTitle id="companion-install-title">Installer la télécommande</DialogTitle>
            <DialogContent dividers>
              <p id="companion-install-description" className="mb-3 text-sm leading-relaxed text-slate-600">
                Ajoutez la télécommande à votre écran d’accueil pour la retrouver facilement. Vous pouvez aussi continuer dans le navigateur.
              </p>
              {deferredPrompt && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="font-semibold text-brand">Votre télécommande, à portée de main</p>
                  <button type="button" onClick={() => void install()} disabled={pending}
                    className={`${primaryButton} min-h-11 min-w-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}>
                    {pending ? 'Ouverture…' : 'Installer'}
                  </button>
                </div>
              )}
              <div className="space-y-2 text-sm leading-relaxed text-slate-600">
                <p><strong className="text-brand">iPhone / iPad · Safari :</strong> ouvrez Partager, puis « Sur l’écran d’accueil ».</p>
                <p><strong className="text-brand">Android :</strong> ouvrez le menu du navigateur, puis « Installer l’application » ou « Ajouter à l’écran d’accueil » (Add to Home screen).</p>
                <p>La disponibilité dépend du navigateur. Si l’option manque, ouvrez cette page dans Safari sur iOS ou un navigateur compatible sur Android.</p>
                <p>Connexion nécessaire pour piloter le minuteur. L’association à votre équipe est mémorisée sur ce téléphone, si le navigateur autorise le stockage. Utilisez « Oublier cette équipe » sur un appareil partagé. Sur iPhone, si l’app installée ouvre un espace de stockage distinct, scannez de nouveau le même QR code.</p>
              </div>
              {!secure && <p className="mt-2 leading-relaxed">L’installation nécessite un contexte sécurisé : HTTPS, ou localhost pour les essais locaux.</p>}
              {message && <p role="status" className="mt-2 leading-relaxed">{message}</p>}
              <FormControlLabel className="mt-3" control={<Checkbox checked={doNotShowAgain}
                onChange={event => updatePreference(event.target.checked)} />}
                label="Ne plus afficher automatiquement" />
              {storageError && <p role="alert" className="mt-2 text-sm leading-relaxed text-amber-800">{storageError}</p>}
              {workerError && <p role="alert" className="mt-2 text-sm leading-relaxed text-amber-800">{workerError}</p>}
            </DialogContent>
            <DialogActions>
              <Button autoFocus onClick={() => setOpen(false)} sx={{ minHeight: 44 }}>Continuer dans le navigateur</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      {storageError && !open && <p role="alert" className="mt-2 leading-relaxed text-amber-800">{storageError}</p>}
      {workerError && !open && <p role="alert" className="mt-2 leading-relaxed text-amber-800">{workerError}</p>}
    </aside>
  );
}