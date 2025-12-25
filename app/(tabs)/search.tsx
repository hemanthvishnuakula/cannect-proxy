/**
 * Search Screen - Pure AT Protocol
 */

import { useState, useMemo, useCallback } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Image, ScrollView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { Search as SearchIcon, X, Users, Sparkles, UserPlus, Check } from "lucide-react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSearchUsers, useSearchPosts, useSuggestedUsers, useSuggestedPosts, useFollow } from "@/lib/hooks";
import { useDebounce } from "@/lib/hooks";
import { useAuthStore } from "@/lib/stores";
import { useQueryClient } from "@tanstack/react-query";
import type { AppBskyActorDefs, AppBskyFeedDefs } from '@atproto/api';

type ProfileView = AppBskyActorDefs.ProfileView;
type PostView = AppBskyFeedDefs.PostView;

type SearchTab = "users" | "posts";

function UserRow({ 
  user, 
  onPress, 
  onFollow,
  isFollowPending,
  showFollowButton = true,
  currentUserDid,
}: { 
  user: ProfileView; 
  onPress: () => void;
  onFollow?: () => void;
  isFollowPending?: boolean;
  showFollowButton?: boolean;
  currentUserDid?: string;
}) {
  const isFollowing = !!user.viewer?.following;
  const isSelf = user.did === currentUserDid;
  const canShowFollow = showFollowButton && !isFollowing && !isSelf && onFollow;

  return (
    <Pressable 
      onPress={onPress}
      className="flex-row items-center px-4 py-3 border-b border-border active:bg-surface-elevated"
    >
      {user.avatar ? (
        <Image source={{ uri: user.avatar }} className="w-12 h-12 rounded-full" />
      ) : (
        <View className="w-12 h-12 rounded-full bg-surface-elevated items-center justify-center">
          <Text className="text-text-muted text-lg">{user.handle[0].toUpperCase()}</Text>
        </View>
      )}
      <View className="flex-1 ml-3">
        <Text className="font-semibold text-text-primary">{user.displayName || user.handle}</Text>
        <Text className="text-text-muted">@{user.handle}</Text>
        {user.description && (
          <Text className="text-text-secondary text-sm mt-1" numberOfLines={2}>
            {user.description}
          </Text>
        )}
      </View>
      
      {/* Follow Button */}
      {canShowFollow && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onFollow();
          }}
          disabled={isFollowPending}
          className={`ml-2 px-4 py-2 rounded-full ${isFollowPending ? 'bg-primary/50' : 'bg-primary'}`}
        >
          {isFollowPending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <View className="flex-row items-center gap-1">
              <UserPlus size={14} color="white" />
              <Text className="text-white font-semibold text-sm">Follow</Text>
            </View>
          )}
        </Pressable>
      )}
      
      {/* Already Following Badge */}
      {isFollowing && !isSelf && (
        <View className="ml-2 flex-row items-center gap-1 px-3 py-2 rounded-full bg-surface-elevated">
          <Check size={14} color="#10B981" />
          <Text className="text-primary text-sm font-medium">Following</Text>
        </View>
      )}
    </Pressable>
  );
}

function PostRow({ post, onPress }: { post: PostView; onPress: () => void }) {
  const record = post.record as any;
  return (
    <Pressable 
      onPress={onPress}
      className="px-4 py-3 border-b border-border active:bg-surface-elevated"
    >
      <View className="flex-row items-center mb-2">
        {post.author.avatar ? (
          <Image source={{ uri: post.author.avatar }} className="w-8 h-8 rounded-full" />
        ) : (
          <View className="w-8 h-8 rounded-full bg-surface-elevated items-center justify-center">
            <Text className="text-text-muted">{post.author.handle[0].toUpperCase()}</Text>
          </View>
        )}
        <Text className="font-semibold text-text-primary ml-2">
          {post.author.displayName || post.author.handle}
        </Text>
        <Text className="text-text-muted ml-1">@{post.author.handle}</Text>
      </View>
      <Text className="text-text-primary" numberOfLines={3}>{record.text}</Text>
    </Pressable>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("users");
  
  const debouncedQuery = useDebounce(query, 300);
  const hasQuery = debouncedQuery.trim().length >= 2;

  const usersQuery = useSearchUsers(hasQuery && activeTab === "users" ? debouncedQuery : "");
  const postsQuery = useSearchPosts(hasQuery && activeTab === "posts" ? debouncedQuery : "");
  const suggestedUsersQuery = useSuggestedUsers();
  const suggestedPostsQuery = useSuggestedPosts();
  
  const { did: currentUserDid } = useAuthStore();
  const followMutation = useFollow();
  const queryClient = useQueryClient();
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(new Set());

  // Filter out users already being followed and self
  const users = useMemo(() => {
    const allUsers = usersQuery.data?.pages?.flatMap(page => page.actors) || [];
    return allUsers.filter(user => 
      !user.viewer?.following && user.did !== currentUserDid
    );
  }, [usersQuery.data, currentUserDid]);

  // Filter suggested users - exclude already following and self
  const suggestedUsers = useMemo(() => {
    const allUsers = suggestedUsersQuery.data || [];
    return allUsers.filter(user => 
      !user.viewer?.following && user.did !== currentUserDid
    );
  }, [suggestedUsersQuery.data, currentUserDid]);

  const posts = useMemo(() => {
    return postsQuery.data?.pages?.flatMap(page => page.posts) || [];
  }, [postsQuery.data]);

  const isLoading = activeTab === "users" ? usersQuery.isLoading : postsQuery.isLoading;
  const data = activeTab === "users" ? users : posts;

  const handleUserPress = (user: ProfileView) => {
    router.push(`/user/${user.handle}`);
  };

  const handlePostPress = (post: PostView) => {
    const uriParts = post.uri.split('/');
    const rkey = uriParts[uriParts.length - 1];
    router.push(`/post/${post.author.did}/${rkey}`);
  };

  const handleFollow = useCallback(async (user: ProfileView) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    setPendingFollows(prev => new Set(prev).add(user.did));
    
    try {
      await followMutation.mutateAsync(user.did);
      // Invalidate queries to refresh the user lists
      queryClient.invalidateQueries({ queryKey: ['searchUsers'] });
      queryClient.invalidateQueries({ queryKey: ['suggestedUsers'] });
    } catch (error) {
      console.error('Failed to follow:', error);
    } finally {
      setPendingFollows(prev => {
        const next = new Set(prev);
        next.delete(user.did);
        return next;
      });
    }
  }, [followMutation, queryClient]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Search Header */}
      <View className="px-4 py-3 border-b border-border">
        <View className="flex-row items-center bg-surface-elevated rounded-xl px-4 py-2">
          <SearchIcon size={20} color="#6B7280" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Cannect..."
            placeholderTextColor="#6B7280"
            className="flex-1 ml-2 text-text-primary text-base py-1"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")}>
              <X size={20} color="#6B7280" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-border">
        <Pressable
          onPress={() => setActiveTab("users")}
          className={`flex-1 py-3 items-center ${activeTab === "users" ? "border-b-2 border-primary" : ""}`}
        >
          <Text className={activeTab === "users" ? "text-primary font-semibold" : "text-text-muted"}>
            Users
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("posts")}
          className={`flex-1 py-3 items-center ${activeTab === "posts" ? "border-b-2 border-primary" : ""}`}
        >
          <Text className={activeTab === "posts" ? "text-primary font-semibold" : "text-text-muted"}>
            Posts
          </Text>
        </Pressable>
      </View>

      {/* Results */}
      {!hasQuery ? (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {activeTab === "users" ? (
            <>
              {/* Suggested Users Section */}
              <View className="px-4 pt-4 pb-2">
                <View className="flex-row items-center gap-2 mb-3">
                  <Sparkles size={18} color="#10B981" />
                  <Text className="text-text-primary font-semibold text-lg">
                    Cannect Users
                  </Text>
                </View>
              </View>
              
              {suggestedUsersQuery.isLoading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="large" color="#10B981" />
                </View>
              ) : suggestedUsers && suggestedUsers.length > 0 ? (
                suggestedUsers.map((user) => (
                  <UserRow 
                    key={user.did} 
                    user={user} 
                    onPress={() => handleUserPress(user)}
                    onFollow={() => handleFollow(user)}
                    isFollowPending={pendingFollows.has(user.did)}
                    currentUserDid={currentUserDid || undefined}
                  />
                ))
              ) : (
                <View className="py-12 items-center px-6">
                  <Users size={48} color="#6B7280" />
                  <Text className="text-text-primary text-lg font-semibold mt-4">
                    Be the first!
                  </Text>
                  <Text className="text-text-muted text-center mt-2">
                    No Cannect users yet. Invite your friends to join!
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              {/* Suggested Posts Section */}
              <View className="px-4 pt-4 pb-2">
                <View className="flex-row items-center gap-2 mb-3">
                  <Sparkles size={18} color="#10B981" />
                  <Text className="text-text-primary font-semibold text-lg">
                    From Cannect
                  </Text>
                </View>
              </View>
              
              {suggestedPostsQuery.isLoading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="large" color="#10B981" />
                </View>
              ) : suggestedPostsQuery.data && suggestedPostsQuery.data.length > 0 ? (
                suggestedPostsQuery.data.map((post) => (
                  <PostRow 
                    key={post.uri} 
                    post={post} 
                    onPress={() => handlePostPress(post)} 
                  />
                ))
              ) : (
                <View className="py-12 items-center px-6">
                  <Sparkles size={48} color="#6B7280" />
                  <Text className="text-text-primary text-lg font-semibold mt-4">
                    No posts yet
                  </Text>
                  <Text className="text-text-muted text-center mt-2">
                    Be the first to share on Cannect!
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <FlashList
          data={data}
          keyExtractor={(item: any, index) => `${item.uri || item.did}-${index}`}
          estimatedItemSize={80}
          renderItem={({ item }: { item: any }) => 
            activeTab === "users" ? (
              <UserRow 
                user={item} 
                onPress={() => handleUserPress(item)}
                onFollow={() => handleFollow(item)}
                isFollowPending={pendingFollows.has(item.did)}
                currentUserDid={currentUserDid || undefined}
              />
            ) : (
              <PostRow post={item} onPress={() => handlePostPress(item)} />
            )
          }
          onEndReached={() => {
            const query = activeTab === "users" ? usersQuery : postsQuery;
            if (query.hasNextPage && !query.isFetchingNextPage) {
              query.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-text-muted">
                No {activeTab === "users" ? "users" : "posts"} found
              </Text>
            </View>
          }
          ListFooterComponent={
            (activeTab === "users" ? usersQuery : postsQuery).isFetchingNextPage ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#10B981" />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
