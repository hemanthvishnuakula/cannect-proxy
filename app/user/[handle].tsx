/**
 * User Profile Screen - Pure AT Protocol
 * 
 * Route: /user/[handle]
 * Displays a user's profile with tabs: Posts, Reposts, Replies, Likes
 * Matches the design of the own profile page
 */

import { View, Text, Pressable, ActivityIndicator, Platform, RefreshControl, Share as RNShare } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { ArrowLeft, UserPlus, UserMinus, MoreHorizontal } from "lucide-react-native";
import { Image } from "expo-image";
import { useState, useMemo, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { useProfile, useAuthorFeed, useActorLikes, useFollow, useUnfollow, useLikePost, useUnlikePost, useRepost, useDeleteRepost, useDeletePost } from "@/lib/hooks";
import { useAuthStore } from "@/lib/stores";
import { RepostMenu } from "@/components/social/RepostMenu";
import { PostOptionsMenu } from "@/components/social/PostOptionsMenu";
import { PostCard } from "@/components/Post";
import type { AppBskyFeedDefs, AppBskyFeedPost } from '@atproto/api';

type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
type PostView = AppBskyFeedDefs.PostView;
type ProfileTab = "posts" | "reposts" | "replies" | "likes";

function formatNumber(num: number | undefined): string {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export default function UserProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const { did: myDid } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [repostMenuVisible, setRepostMenuVisible] = useState(false);
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostView | null>(null);
  
  const profileQuery = useProfile(handle || "");
  const profileData = profileQuery.data;
  const isOwnProfile = profileData?.did === myDid;
  
  // Mutations
  const followMutation = useFollow();
  const unfollowMutation = useUnfollow();
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const repostMutation = useRepost();
  const deleteRepostMutation = useDeleteRepost();
  const deletePostMutation = useDeletePost();
  
  // Different feeds based on active tab
  const postsQuery = useAuthorFeed(profileData?.did, 'posts_no_replies');
  const repliesQuery = useAuthorFeed(profileData?.did, 'posts_with_replies');
  // Only fetch likes for own profile - getActorLikes only works for authenticated user
  const likesQuery = useActorLikes(isOwnProfile ? profileData?.did : undefined);

  // Get posts data based on active tab
  const posts = useMemo(() => {
    if (activeTab === "posts") {
      return postsQuery.data?.pages?.flatMap(page => page.feed) || [];
    } else if (activeTab === "reposts") {
      // Filter for reposts only
      const allPosts = postsQuery.data?.pages?.flatMap(page => page.feed) || [];
      return allPosts.filter(item => item.reason?.$type === 'app.bsky.feed.defs#reasonRepost');
    } else if (activeTab === "replies") {
      // Get posts with replies then filter for actual replies
      const allPosts = repliesQuery.data?.pages?.flatMap(page => page.feed) || [];
      return allPosts.filter(item => {
        const record = item.post.record as any;
        return record?.reply; // Has reply reference = it's a reply
      });
    } else if (activeTab === "likes") {
      return likesQuery.data?.pages?.flatMap(page => page.feed) || [];
    }
    return [];
  }, [activeTab, postsQuery.data, repliesQuery.data, likesQuery.data]);

  const currentQuery = activeTab === "likes" ? likesQuery : 
                       activeTab === "replies" ? repliesQuery : postsQuery;

  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/feed');
    }
  };

  const handleRefresh = useCallback(() => {
    triggerHaptic();
    profileQuery.refetch();
    currentQuery.refetch();
  }, [profileQuery, currentQuery]);

  const handleFollowToggle = async () => {
    if (!profileData) return;
    triggerHaptic();
    
    if (profileData.viewer?.following) {
      await unfollowMutation.mutateAsync(profileData.viewer.following);
    } else {
      await followMutation.mutateAsync(profileData.did);
    }
    profileQuery.refetch();
  };

  // Post action handlers
  const handleLike = useCallback((post: PostView) => {
    triggerHaptic();
    if (post.viewer?.like) {
      unlikeMutation.mutate({ likeUri: post.viewer.like, postUri: post.uri });
    } else {
      likeMutation.mutate({ uri: post.uri, cid: post.cid });
    }
  }, [likeMutation, unlikeMutation]);

  const handleRepost = useCallback((post: PostView) => {
    triggerHaptic();
    setSelectedPost(post);
    setRepostMenuVisible(true);
  }, []);

  const handleReply = useCallback((post: PostView) => {
    const uriParts = post.uri.split('/');
    const rkey = uriParts[uriParts.length - 1];
    router.push(`/post/${post.author.did}/${rkey}?reply=true`);
  }, [router]);

  const handleShare = useCallback(async (post: PostView) => {
    const bskyUrl = `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`;
    try {
      await RNShare.share({ url: bskyUrl, message: bskyUrl });
    } catch (e) {
      // ignore
    }
  }, []);

  const handleRepostAction = useCallback(() => {
    if (!selectedPost) return;
    if (selectedPost.viewer?.repost) {
      deleteRepostMutation.mutate({ repostUri: selectedPost.viewer.repost, postUri: selectedPost.uri });
    } else {
      repostMutation.mutate({ uri: selectedPost.uri, cid: selectedPost.cid });
    }
    setRepostMenuVisible(false);
    setSelectedPost(null);
  }, [selectedPost, repostMutation, deleteRepostMutation]);

  const handleQuote = useCallback(() => {
    if (!selectedPost) return;
    router.push({
      pathname: '/compose',
      params: { quoteUri: selectedPost.uri, quoteCid: selectedPost.cid }
    } as any);
    setRepostMenuVisible(false);
    setSelectedPost(null);
  }, [selectedPost, router]);

  // Open options menu
  const handleOptionsPress = useCallback((post: PostView) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedPost(post);
    setOptionsMenuVisible(true);
  }, []);

  // Delete post handler
  const handleDelete = useCallback(async () => {
    if (!selectedPost) return;
    
    try {
      await deletePostMutation.mutateAsync(selectedPost.uri);
      setOptionsMenuVisible(false);
      setSelectedPost(null);
      // Don't refetch - optimistic update already removed the post
      // Refetching would bring it back due to AppView caching delays
    } catch (error) {
      console.error('Failed to delete post:', error);
    }
  }, [selectedPost, deletePostMutation]);

  // Loading state
  if (profileQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen 
          options={{ 
            headerShown: true,
            headerTitle: "",
            headerStyle: { backgroundColor: "#0A0A0A" },
            headerTintColor: "#FAFAFA",
            contentStyle: { backgroundColor: "#0A0A0A" },
            headerLeft: () => (
              <Pressable onPress={handleBack} className="p-2 -ml-2 active:opacity-70">
                <ArrowLeft size={24} color="#FAFAFA" />
              </Pressable>
            ),
          }}
        />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (profileQuery.error || !profileData) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen 
          options={{ 
            headerShown: true,
            headerTitle: "",
            headerStyle: { backgroundColor: "#0A0A0A" },
            headerTintColor: "#FAFAFA",
            contentStyle: { backgroundColor: "#0A0A0A" },
            headerLeft: () => (
              <Pressable onPress={handleBack} className="p-2 -ml-2 active:opacity-70">
                <ArrowLeft size={24} color="#FAFAFA" />
              </Pressable>
            ),
          }}
        />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-text-muted text-center text-lg">User not found</Text>
          <Text className="text-text-muted text-center mt-2">@{handle}</Text>
          <Pressable onPress={() => profileQuery.refetch()} className="mt-4 px-4 py-2 bg-primary rounded-lg">
            <Text className="text-white font-medium">Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isFollowing = !!profileData.viewer?.following;
  const isFollowPending = followMutation.isPending || unfollowMutation.isPending;

  // Only show Likes tab for own profile - getActorLikes only works for authenticated user
  const tabs: { key: ProfileTab; label: string }[] = [
    { key: "posts", label: "Posts" },
    { key: "reposts", label: "Reposts" },
    { key: "replies", label: "Replies" },
    ...(isOwnProfile ? [{ key: "likes" as ProfileTab, label: "Likes" }] : []),
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Stack.Screen 
        options={{ 
          headerShown: true,
          headerTitle: "",
          headerStyle: { backgroundColor: "#0A0A0A" },
          headerTintColor: "#FAFAFA",
          contentStyle: { backgroundColor: "#0A0A0A" },
          headerLeft: () => (
            <Pressable onPress={handleBack} className="p-2 -ml-2 active:opacity-70">
              <ArrowLeft size={24} color="#FAFAFA" />
            </Pressable>
          ),
        }}
      />
      
      <View className="flex-1">
        <FlashList
          data={posts}
          keyExtractor={(item, index) => `${item.post.uri}-${index}`}
          estimatedItemSize={150}
        ListHeaderComponent={
          <View>
            {/* Banner */}
            {profileData.banner ? (
              <Image 
                source={{ uri: profileData.banner }} 
                className="w-full h-32"
                contentFit="cover"
              />
            ) : (
              <View className="w-full h-32 bg-primary/20" />
            )}

            {/* Profile Info */}
            <View className="px-4 -mt-12">
              {/* Avatar */}
              {profileData.avatar ? (
                <Image 
                  source={{ uri: profileData.avatar }} 
                  className="w-24 h-24 rounded-full border-4 border-background"
                  contentFit="cover"
                />
              ) : (
                <View className="w-24 h-24 rounded-full border-4 border-background bg-surface-elevated items-center justify-center">
                  <Text className="text-text-muted text-3xl">
                    {(profileData.handle || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Actions - Follow/Unfollow for other users */}
              {!isOwnProfile && (
                <View className="absolute right-4 top-14 flex-row gap-2">
                  <Pressable className="p-2 rounded-full border border-border bg-surface-elevated active:opacity-70">
                    <MoreHorizontal size={18} color="#6B7280" />
                  </Pressable>
                  <Pressable 
                    onPress={handleFollowToggle}
                    disabled={isFollowPending}
                    className={`px-4 py-2 rounded-full flex-row items-center ${
                      isFollowing ? 'bg-surface-elevated border border-border' : 'bg-primary'
                    } ${isFollowPending ? 'opacity-50' : ''} active:opacity-70`}
                  >
                    {isFollowPending ? (
                      <ActivityIndicator size="small" color={isFollowing ? "#6B7280" : "#FFFFFF"} />
                    ) : (
                      <>
                        {isFollowing ? (
                          <UserMinus size={16} color="#6B7280" />
                        ) : (
                          <UserPlus size={16} color="#FFFFFF" />
                        )}
                        <Text className={`ml-1 font-semibold ${isFollowing ? 'text-text-muted' : 'text-white'}`}>
                          {isFollowing ? 'Unfollow' : 'Follow'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}

              {/* Name & Handle */}
              <Text className="text-xl font-bold text-text-primary mt-3">
                {profileData.displayName || profileData.handle}
              </Text>
              <Text className="text-text-muted">@{profileData.handle}</Text>

              {/* Bio */}
              {profileData.description && (
                <Text className="text-text-primary mt-2">{profileData.description}</Text>
              )}

              {/* Stats */}
              <View className="flex-row gap-4 mt-3">
                <Pressable 
                  className="flex-row items-center active:opacity-70"
                  onPress={() => router.push(`/user/${handle}/followers` as any)}
                >
                  <Text className="font-bold text-text-primary">
                    {formatNumber(profileData.followersCount)}
                  </Text>
                  <Text className="text-text-muted ml-1">followers</Text>
                </Pressable>
                <Pressable 
                  className="flex-row items-center active:opacity-70"
                  onPress={() => router.push(`/user/${handle}/following` as any)}
                >
                  <Text className="font-bold text-text-primary">
                    {formatNumber(profileData.followsCount)}
                  </Text>
                  <Text className="text-text-muted ml-1">following</Text>
                </Pressable>
                <View className="flex-row items-center">
                  <Text className="font-bold text-text-primary">
                    {formatNumber(profileData.postsCount)}
                  </Text>
                  <Text className="text-text-muted ml-1">posts</Text>
                </View>
              </View>
            </View>

            {/* Tabs */}
            <View className="flex-row border-b border-border mt-4">
              {tabs.map((tab) => (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  className={`flex-1 py-3 items-center ${activeTab === tab.key ? "border-b-2 border-primary" : ""}`}
                >
                  <Text className={activeTab === tab.key ? "text-primary font-semibold" : "text-text-muted"}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard 
            item={item}
            onLike={() => handleLike(item.post)}
            onRepost={() => handleRepost(item.post)}
            onReply={() => handleReply(item.post)}
            onShare={() => handleShare(item.post)}
            onOptionsPress={() => handleOptionsPress(item.post)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isRefetching || currentQuery.isRefetching}
            onRefresh={handleRefresh}
            tintColor="#10B981"
          />
        }
        onEndReached={() => {
          if (currentQuery.hasNextPage && !currentQuery.isFetchingNextPage) {
            currentQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          currentQuery.isLoading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#10B981" />
            </View>
          ) : (
            <View className="py-20 items-center">
              <Text className="text-text-muted">
                {activeTab === "posts" && "No posts yet"}
                {activeTab === "reposts" && "No reposts yet"}
                {activeTab === "replies" && "No replies yet"}
                {activeTab === "likes" && "No likes yet"}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          currentQuery.isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color="#10B981" />
            </View>
          ) : null
        }
      />
      </View>

      {/* Repost Menu */}
      <RepostMenu
        isVisible={repostMenuVisible}
        onClose={() => {
          setRepostMenuVisible(false);
          setSelectedPost(null);
        }}
        onRepost={handleRepostAction}
        onQuotePost={handleQuote}
        isReposted={!!selectedPost?.viewer?.repost}
      />

      {/* Post Options Menu */}
      <PostOptionsMenu
        isVisible={optionsMenuVisible}
        onClose={() => {
          setOptionsMenuVisible(false);
          setSelectedPost(null);
        }}
        onDelete={handleDelete}
        isOwnPost={selectedPost?.author.did === myDid}
        postUrl={selectedPost ? `https://bsky.app/profile/${selectedPost.author.handle}/post/${selectedPost.uri.split('/').pop()}` : undefined}
        postText={(selectedPost?.record as any)?.text}
        authorHandle={selectedPost?.author.handle}
        postUri={selectedPost?.uri}
        postCid={selectedPost?.cid}
      />
    </SafeAreaView>
  );
}
