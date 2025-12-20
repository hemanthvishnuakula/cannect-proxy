import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types/database";

interface PdsSessionData {
  accessJwt: string;
  refreshJwt: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Federation state
  did: string | null;
  handle: string | null;
  isFederated: boolean;
  pdsSession: PdsSessionData | null;
  
  // Actions
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  setFederationState: (did: string | null, handle: string | null, pdsSession?: PdsSessionData | null) => void;
  setPdsSession: (pdsSession: PdsSessionData | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  
  // Federation state defaults
  did: null,
  handle: null,
  isFederated: false,
  pdsSession: null,
  
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      isAuthenticated: !!session,
      isLoading: false,
    }),
    
  setProfile: (profile) => set((state) => ({ 
    profile,
    // Update federation state from profile
    did: profile?.did ?? state.did,
    handle: profile?.handle ?? state.handle,
    isFederated: !!profile?.did && !!profile?.pds_url,
  })),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setFederationState: (did, handle, pdsSession = null) =>
    set({
      did,
      handle,
      isFederated: !!did && !!handle,
      pdsSession,
    }),
    
  setPdsSession: (pdsSession) => set({ pdsSession }),
  
  clear: () =>
    set({
      session: null,
      user: null,
      profile: null,
      isAuthenticated: false,
      did: null,
      handle: null,
      isFederated: false,
      pdsSession: null,
    }),
}));
