import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

// Common headers for edge function calls
const getProxyHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "apikey": SUPABASE_ANON_KEY,
});

/**
 * Bluesky Actor (normalized for UI consistency)
 */
export interface BlueskyActor {
  id: string; // DID
  username: string; // handle
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  is_federated: true;
}

/**
 * Dual-mode search: Local Cannect profiles + Global Bluesky actors
 */
export function useSearch(query: string) {
  return useQuery({
    queryKey: ["search", "unified", query],
    queryFn: async () => {
      if (!query.trim() || query.length < 2) {
        return { local: [], global: [] };
      }

      // 1. Local Cannect Search (Supabase)
      const { data: localProfiles } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);

      // 2. Global Discovery (Bluesky API via Edge Function)
      let globalActors: BlueskyActor[] = [];
      try {
        const proxyUrl = `${SUPABASE_URL}/functions/v1/bluesky-proxy?action=searchActors&q=${encodeURIComponent(query)}&limit=10`;
        const response = await fetch(proxyUrl, {
          headers: getProxyHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          globalActors = (data.actors || []).map((actor: any) => ({
            id: actor.did,
            username: actor.handle,
            display_name: actor.displayName || actor.handle,
            avatar_url: actor.avatar || null,
            bio: actor.description || null,
            followers_count: actor.followersCount || 0,
            following_count: actor.followsCount || 0,
            is_federated: true,
          }));
        }
      } catch (error) {
        console.error("Bluesky actor search failed:", error);
      }

      return {
        local: localProfiles || [],
        global: globalActors,
      };
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get trending/suggested Bluesky actors for discovery (empty state)
 */
export function useTrendingActors() {
  return useQuery({
    queryKey: ["search", "trending"],
    queryFn: async () => {
      try {
        const proxyUrl = `${SUPABASE_URL}/functions/v1/bluesky-proxy?action=trending&limit=15`;
        const response = await fetch(proxyUrl, {
          headers: getProxyHeaders(),
        });

        if (!response.ok) return [];

        const data = await response.json();
        return (data.actors || []).map((actor: any) => ({
          id: actor.did,
          username: actor.handle,
          display_name: actor.displayName || actor.handle,
          avatar_url: actor.avatar || null,
          bio: actor.description || null,
          followers_count: actor.followersCount || 0,
          following_count: actor.followsCount || 0,
          is_federated: true,
        })) as BlueskyActor[];
      } catch (error) {
        console.error("Trending actors fetch failed:", error);
        return [];
      }
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

/**
 * Get active Cannect users (most recent posts) for discovery
 */
export function useActiveCannectUsers() {
  return useQuery({
    queryKey: ["search", "active-users"],
    queryFn: async () => {
      // Get users who posted most recently
      const { data } = await supabase
        .from("posts")
        .select("user_id, author:profiles!user_id(*)")
        .eq("is_reply", false)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!data) return [];

      // Dedupe by user_id and take top 10
      const seen = new Set<string>();
      const uniqueUsers: any[] = [];
      for (const post of data) {
        if (post.author && !seen.has(post.user_id)) {
          seen.add(post.user_id);
          uniqueUsers.push(post.author);
          if (uniqueUsers.length >= 10) break;
        }
      }

      return uniqueUsers;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
