import { createContext, useState, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  devBypass: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  enableDevBypass: () => void;
};

export const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  devBypass: false,
  signInWithApple: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  enableDevBypass: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [devBypass, setDevBypass] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithApple = async () => {
    // TODO: Conectar cuando las credenciales de Apple Developer estén listas
    console.warn('[Auth] Apple Sign-In no configurado todavía');
  };

  const signInWithGoogle = async () => {
    // TODO: Conectar cuando las credenciales de Google OAuth estén listas
    console.warn('[Auth] Google Sign-In no configurado todavía');
  };

  const signOut = async () => {
    setDevBypass(false);
    await supabase.auth.signOut();
  };

  const enableDevBypass = () => {
    if (__DEV__) {
      setDevBypass(true);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        devBypass,
        signInWithApple,
        signInWithGoogle,
        signOut,
        enableDevBypass,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
