import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/Button";

/** Hlášky service workeru: nová verze ke stažení, aplikace připravená offline, stav připojení. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  const online = useOnline();

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-2">
      {!online && (
        <Toast>
          <WifiOff className="size-4 shrink-0 text-slate-500" />
          <span className="flex-1">Jsi offline. Vše funguje dál, data se ukládají v zařízení.</span>
        </Toast>
      )}
      {offlineReady && (
        <Toast>
          <span className="flex-1">Aplikace je připravená i pro použití offline.</span>
          <IconButton label="Zavřít" onClick={() => setOfflineReady(false)}>
            <X className="size-3.5" />
          </IconButton>
        </Toast>
      )}
      {needRefresh && (
        <Toast>
          <RefreshCw className="size-4 shrink-0 text-slate-700" />
          <span className="flex-1">Je k dispozici nová verze aplikace.</span>
          <Button size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>
            Aktualizovat
          </Button>
          <IconButton label="Později" onClick={() => setNeedRefresh(false)}>
            <X className="size-3.5" />
          </IconButton>
        </Toast>
      )}
    </div>
  );
}

function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-display px-4 py-3 text-sm text-display-ink shadow-[0_12px_32px_-8px_rgb(20_20_18/0.5)] [&_svg]:text-display-dim">
      {children}
    </div>
  );
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
