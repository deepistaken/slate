/**
 * Client auth context. Wrap the app in <AuthProvider> and read state anywhere
 * with useAuth(). Backed by Supabase email+password auth. Safe when Supabase
 * isn't configured: `configured` is false and the app renders logged-out.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowser, supabaseConfigured } from "@/lib/supabase-browser";

type AuthResult = { error: string | null };

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, captchaToken?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setLoading(false);
      return;
    }
    let active = true;

    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (email, password, captchaToken) => {
    const sb = getSupabaseBrowser();
    if (!sb) return { error: "Accounts aren't set up yet." };
    const { error } = await sb.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async (email, password, captchaToken) => {
    const sb = getSupabaseBrowser();
    if (!sb) return { error: "Accounts aren't set up yet." };
    const { error } = await sb.auth.signUp({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    await sb.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ configured: supabaseConfigured, loading, user, session, signIn, signUp, signOut }),
    [loading, user, session, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
