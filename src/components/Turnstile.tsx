/**
 * Cloudflare Turnstile widget. Renders only when VITE_TURNSTILE_SITE_KEY is set,
 * so the login form works with or without a bot wall configured. The token it
 * produces is passed to Supabase auth (signup/login), which verifies it against
 * the secret key you configure in the Supabase dashboard.
 */
import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export const turnstileEnabled = Boolean(SITE_KEY);

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __slateTurnstileLoading?: boolean;
  }
}

function ensureScript(): void {
  if (typeof document === "undefined") return;
  if (window.turnstile || window.__slateTurnstileLoading) return;
  window.__slateTurnstileLoading = true;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
}

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    ensureScript();
    let cancelled = false;

    const tryRender = () => {
      if (cancelled) return;
      const el = ref.current;
      if (window.turnstile && el && widgetId.current === null) {
        widgetId.current = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          theme: "auto",
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      } else {
        setTimeout(tryRender, 250);
      }
    };
    tryRender();

    return () => {
      cancelled = true;
      if (window.turnstile && widgetId.current) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* ignore */
        }
        widgetId.current = null;
      }
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="flex justify-center" />;
}
