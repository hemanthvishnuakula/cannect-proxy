/**
 * Federated Auth Hook
 * 
 * Handles authentication with automatic AT Protocol federation via cannect.space PDS.
 * Every new user gets:
 * - Supabase auth account
 * - did:plc identifier (registered with plc.directory)
 * - Handle: username.cannect.space
 * - PDS session tokens for federation
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-client";
import { useAuth } from "./use-auth";

// Edge function URL for federated account creation
const EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-federated-account`;

interface FederatedSignUpInput {
  email: string;
  password: string;
  username: string;
  displayName?: string;
}

interface FederatedAccountResult {
  success: boolean;
  did: string;
  handle: string;
  pdsUrl: string;
  accessJwt: string;
  refreshJwt: string;
}

interface PdsSession {
  user_id: string;
  access_jwt: string;
  refresh_jwt: string;
  did: string;
  handle: string;
  updated_at: string;
}

/**
 * Hook to get the current user's PDS session (if federated)
 */
export function usePdsSession() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...queryKeys.profiles.all, 'pds-session', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("pds_sessions")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No session found - user not federated yet
          return null;
        }
        throw error;
      }

      return data as PdsSession;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

/**
 * Hook to check if current user is federated (has a DID)
 */
export function useIsFederated() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...queryKeys.profiles.all, 'is-federated', user?.id],
    queryFn: async () => {
      if (!user) return false;

      // Note: pds_registered column added by migration 20251220200000_pds_integration.sql
      const { data, error } = await supabase
        .from("profiles")
        .select("did, handle")
        .eq("id", user.id)
        .single();

      if (error) return false;
      
      // Check if user has a DID (meaning they're federated)
      // pds_registered column will exist after migration is deployed
      const profileData = data as { did: string | null; handle: string | null; pds_registered?: boolean };
      
      return {
        isFederated: !!profileData?.did,
        did: profileData?.did,
        handle: profileData?.handle,
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

/**
 * Federated sign-up hook
 * 
 * Creates both:
 * 1. Supabase auth account (via standard signUp)
 * 2. PDS account on cannect.space (via edge function)
 * 
 * Returns the DID and handle for the new account.
 */
export function useFederatedSignUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password, username, displayName }: FederatedSignUpInput) => {
      // Step 1: Create Supabase auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: displayName || username,
            avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || username)}&background=10B981&color=fff`,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Failed to create user account");

      // Check if email confirmation is required
      const needsEmailConfirmation = !authData.session && !!authData.user;
      
      // Step 2: Create federated account on PDS
      // Only do this if we have a session (no email confirmation required)
      // OR if user exists (we can still create PDS account)
      if (authData.user) {
        try {
          const response = await fetch(EDGE_FUNCTION_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Use the access token if available
              ...(authData.session?.access_token && {
                "Authorization": `Bearer ${authData.session.access_token}`,
              }),
            },
            body: JSON.stringify({
              email,
              username,
              password, // Same password for PDS account
              supabaseUserId: authData.user.id,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error("[useFederatedSignUp] PDS creation failed:", errorData);
            // Don't throw - user can still use the app, just not federated
            // We can retry federation later
            return {
              ...authData,
              needsEmailConfirmation,
              federationError: errorData.message || "Failed to create federated account",
              isFederated: false,
            };
          }

          const pdsResult = await response.json() as FederatedAccountResult;
          console.log("[useFederatedSignUp] ✅ Federated account created:", pdsResult.handle);

          return {
            ...authData,
            needsEmailConfirmation,
            did: pdsResult.did,
            handle: pdsResult.handle,
            pdsUrl: pdsResult.pdsUrl,
            isFederated: true,
          };
        } catch (pdsError) {
          console.error("[useFederatedSignUp] PDS creation error:", pdsError);
          return {
            ...authData,
            needsEmailConfirmation,
            federationError: pdsError instanceof Error ? pdsError.message : "Unknown error",
            isFederated: false,
          };
        }
      }

      return {
        ...authData,
        needsEmailConfirmation,
        isFederated: false,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all });
    },
  });
}

/**
 * Hook to federate an existing non-federated user
 * 
 * For users who signed up before federation was enabled,
 * or whose federation failed during signup.
 */
export function useFederateExistingUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ password }: { password: string }) => {
      if (!user) throw new Error("Must be logged in");

      // Get user's email and username from profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        throw new Error("Could not find user profile");
      }

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("No active session");

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          email: user.email,
          username: profile.username,
          password,
          supabaseUserId: user.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to federate account");
      }

      const result = await response.json() as FederatedAccountResult;
      
      return {
        did: result.did,
        handle: result.handle,
        pdsUrl: result.pdsUrl,
      };
    },
    onSuccess: () => {
      // Refresh profile data to get the new DID
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all });
    },
  });
}

/**
 * Hook to refresh PDS session tokens
 * 
 * Call this when the access token expires (typically after 2 hours)
 */
export function useRefreshPdsSession() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Must be logged in");

      // Get current refresh token from database
      const { data: session, error: sessionError } = await supabase
        .from("pds_sessions")
        .select("refresh_jwt")
        .eq("user_id", user.id)
        .single();

      if (sessionError || !session) {
        throw new Error("No PDS session found");
      }

      // Call PDS to refresh the session
      const response = await fetch("https://cannect.space/xrpc/com.atproto.server.refreshSession", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.refresh_jwt}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to refresh PDS session");
      }

      const refreshedSession = await response.json();

      // Update the stored tokens
      const { error: updateError } = await supabase
        .from("pds_sessions")
        .update({
          access_jwt: refreshedSession.accessJwt,
          refresh_jwt: refreshedSession.refreshJwt,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("[useRefreshPdsSession] Failed to update tokens:", updateError);
      }

      return {
        accessJwt: refreshedSession.accessJwt,
        refreshJwt: refreshedSession.refreshJwt,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.profiles.all, 'pds-session'] });
    },
  });
}

/**
 * Hook to get a valid PDS access token, refreshing if needed
 */
export function useGetPdsAccessToken() {
  const { data: pdsSession } = usePdsSession();
  const refreshSession = useRefreshPdsSession();

  return async (): Promise<string | null> => {
    if (!pdsSession) return null;

    // For now, just return the stored token
    // TODO: Check expiration and refresh if needed
    return pdsSession.access_jwt;
  };
}
