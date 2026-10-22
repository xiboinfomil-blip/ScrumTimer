'use client';

import { useEffect, useRef, useState } from 'react';
import { primaryButton } from '@/components/ui/styles';

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
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const isStandalone = () => displayMode.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const syncDisplayMode = () => {
      setInstalled(isStandalone());
      if (isStandalone()) setDeferredPrompt(null);
    };
    const beforeInstall = (event: Event) => {
      if (isStandalone()) return;
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      setMessage('');
    };
    const appInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setMessage('');
    };

    syncDisplayMode();
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

  if (installed && !workerError) return null;

  return (
    <aside aria-label="Installer la télécommande" className="rounded-xl border border-brand/15 bg-white p-3 text-xs text-slate-600">
      {!installed && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-accent pl-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-brand">Votre télécommande, à portée de main</p>
              <p className="mt-1 leading-relaxed">Un raccourci sur votre écran d’accueil. Connexion nécessaire pour piloter le minuteur.</p>
            </div>
            {deferredPrompt && (
              <button type="button" onClick={() => void install()} disabled={pending}
                className={`${primaryButton} min-h-11 min-w-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}>
                {pending ? 'Ouverture…' : 'Installer'}
              </button>
            )}
          </div>
          {!deferredPrompt && (
            <details className="mt-2 rounded-lg bg-blue-50/70 px-3">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                Ajouter à l’écran d’accueil
              </summary>
              <div className="space-y-2 pb-3 leading-relaxed">
                <p><strong className="text-brand">iPhone / iPad · Safari :</strong> ouvrez Partager, puis « Sur l’écran d’accueil ».</p>
                <p><strong className="text-brand">Android :</strong> ouvrez le menu du navigateur, puis « Installer l’application » ou « Ajouter à l’écran d’accueil » (Add to Home screen).</p>
                <p>La disponibilité dépend du navigateur. Si l’option manque, ouvrez cette page dans Safari sur iOS ou un navigateur compatible sur Android.</p>
              </div>
            </details>
          )}
          {!secure && <p className="mt-2 leading-relaxed">L’installation nécessite un contexte sécurisé : HTTPS, ou localhost pour les essais locaux.</p>}
          <p className="mt-2 leading-relaxed">L’association à votre équipe est mémorisée sur ce téléphone pour les prochaines ouvertures, si le navigateur autorise le stockage. Utilisez « Oublier cette équipe » sur un appareil partagé. Sur iPhone, si l’app installée ouvre un espace de stockage distinct, scannez de nouveau le même QR code.</p>
          {message && <p role="status" className="mt-2 leading-relaxed">{message}</p>}
        </>
      )}
      {workerError && <p role="alert" className="mt-2 leading-relaxed text-amber-800">{workerError}</p>}
    </aside>
  );
}