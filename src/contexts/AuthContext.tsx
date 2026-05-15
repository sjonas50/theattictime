
import { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    let initialSessionResolved = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      console.log('Initial session check:', session?.user?.email);
      initialSessionResolved = true;
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (event === 'INITIAL_SESSION' && !initialSessionResolved) {
          return;
        }

        console.log('Auth state change:', event, newSession?.user?.email);

        // Ignore TOKEN_REFRESHED — the user/session identity hasn't changed,
        // and updating state references causes downstream effects (like Layout's
        // role fetch) to re-run, which looks like a full page refresh when the
        // tab regains focus.
        if (event === 'TOKEN_REFRESHED') {
          setSession(newSession);
          return;
        }

        // Only update user state if the user identity actually changed.
        setSession(newSession);
        setUser((prev) => {
          const nextId = newSession?.user?.id ?? null;
          const prevId = prev?.id ?? null;
          return nextId === prevId ? prev : (newSession?.user ?? null);
        });
        setIsLoading(false);

        if (event === 'PASSWORD_RECOVERY') {
          console.log('Password recovery event detected');
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    navigate('/auth'); // Navigate after sign out
  };

  return (
    <AuthContext.Provider value={{ session, user, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
