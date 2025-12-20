import { View, Text, KeyboardAvoidingView, Platform, Pressable, Alert } from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useState } from "react";
import * as Haptics from "expo-haptics";

import { useThread, useThreadReply, useLikePost, useUnlikePost, useDeletePost, useToggleRepost } from "@/lib/hooks";
import { ThreadRibbon, ThreadSkeleton, ReplyBar } from "@/components/social";
import { useAuthStore } from "@/lib/stores";
import type { PostWithAuthor } from "@/lib/types/database";

export default function PostDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const [replyText, setReplyText] = useState("");
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyTargetUsername, setReplyTargetUsername] = useState<string | null>(null);
  
  // ✅ Post Ribbon: Use the new thread hook for complete ancestor/descendant chains
  const { 
    data: thread, 
    isLoading, 
    error, 
    refetch,
  } = useThread(id ?? "");
  
  // ✅ Diamond Standard: Custom back handler for direct URL access
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/feed');
    }
  };
  
  // ✅ Use the thread-aware reply hook
  const createReply = useThreadReply(id ?? "");
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const deleteMutation = useDeletePost();
  const toggleRepostMutation = useToggleRepost();

  const handleReply = (text: string) => {
    if (!text.trim() || !id) return;
    
    // ✅ Diamond Standard: Haptic feedback on send
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    // Optimistic mutation - replies to the focused post (or nested target)
    createReply.mutate({ 
      content: text, 
      parentId: replyTargetId || id,
    });
    
    // Clear state immediately for snappy feel
    setReplyText("");
    setReplyTargetId(null);
    setReplyTargetUsername(null);
  };
  
  // Helper to start replying to a specific comment
  const startReplyToComment = (postId: string, username?: string) => {
    setReplyTargetId(postId);
    setReplyTargetUsername(username || null);
    setReplyText(username ? `@${username} ` : "");
  };
  
  // Cancel reply target and reset
  const cancelReplyTarget = () => {
    setReplyTargetId(null);
    setReplyTargetUsername(null);
    setReplyText("");
  };

  const handleLike = (targetPost: PostWithAuthor) => {
    // For quote posts of internal posts, like the QUOTED post
    // Simple reposts are now in separate table, so we only check for quotes here
    const isQuoteOfInternal = targetPost.type === 'quote' && 
      targetPost.repost_of_id && 
      !(targetPost as any).external_id;
    
    const likeTargetId = isQuoteOfInternal && targetPost.repost_of_id 
      ? targetPost.repost_of_id 
      : targetPost.id;
    
    if (targetPost.is_liked) {
      unlikeMutation.mutate(likeTargetId);
    } else {
      // Pass AT fields for federation
      likeMutation.mutate({
        postId: likeTargetId,
        subjectUri: (targetPost as any).at_uri,
        subjectCid: (targetPost as any).at_cid,
      });
    }
  };

  const handleRepost = (post: PostWithAuthor) => {
    // ✅ Fix: Prevent rapid clicking during mutation
    if (toggleRepostMutation.isPending) return;
    
    const isReposted = (post as any).is_reposted_by_me === true;
    
    // If already reposted, UNDO (toggle off) - no menu needed
    if (isReposted) {
      toggleRepostMutation.mutate({ post, undo: true });
      return;
    }
    
    // Full repost menu with Quote option
    if (Platform.OS === 'ios') {
      Alert.alert("Share Post", "How would you like to share this?", [
        { text: "Cancel", style: "cancel" },
        { text: "Repost", onPress: () => toggleRepostMutation.mutate({ 
          post, 
          subjectUri: (post as any).at_uri, 
          subjectCid: (post as any).at_cid 
        }) },
        { text: "Quote Post", onPress: () => {
          const quoteUrl = (post as any).at_uri 
            ? `/compose/quote?postId=${post.id}&atUri=${encodeURIComponent((post as any).at_uri)}&atCid=${encodeURIComponent((post as any).at_cid || '')}`
            : `/compose/quote?postId=${post.id}`;
          router.push(quoteUrl as any);
        }}
      ]);
    } else if (Platform.OS === 'web') {
      const wantsQuote = window.confirm('Quote Post? (OK = Quote with comment, Cancel = Simple Repost)');
      if (wantsQuote) {
        const quoteUrl = (post as any).at_uri 
          ? `/compose/quote?postId=${post.id}&atUri=${encodeURIComponent((post as any).at_uri)}&atCid=${encodeURIComponent((post as any).at_cid || '')}`
          : `/compose/quote?postId=${post.id}`;
        router.push(quoteUrl as any);
      } else {
        const confirmRepost = window.confirm('Repost this without comment?');
        if (confirmRepost) {
          toggleRepostMutation.mutate({ 
            post, 
            subjectUri: (post as any).at_uri, 
            subjectCid: (post as any).at_cid 
          });
        }
      }
    } else {
      Alert.alert("Share Post", "How would you like to share this?", [
        { text: "Cancel", style: "cancel" },
        { text: "Repost", onPress: () => toggleRepostMutation.mutate({ 
          post, 
          subjectUri: (post as any).at_uri, 
          subjectCid: (post as any).at_cid 
        }) },
        { text: "Quote Post", onPress: () => {
          const quoteUrl = (post as any).at_uri 
            ? `/compose/quote?postId=${post.id}&atUri=${encodeURIComponent((post as any).at_uri)}&atCid=${encodeURIComponent((post as any).at_cid || '')}`
            : `/compose/quote?postId=${post.id}`;
          router.push(quoteUrl as any);
        }}
      ]);
    }
  };

  const handleMore = (post: PostWithAuthor) => {
    if (post.user_id !== user?.id) return;
    Alert.alert("Manage Post", "Delete this post?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        deleteMutation.mutate(post.id);
        router.back();
      }}
    ]);
  };

  // Loading state
  if (isLoading || !thread) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen 
          options={{ 
            headerShown: true,
            headerTitle: "Thread",
            headerStyle: { backgroundColor: "#0A0A0A" },
            headerTintColor: "#FAFAFA",
            headerLeft: () => (
              <Pressable onPress={handleBack} className="p-2 -ml-2 active:opacity-70">
                <ArrowLeft size={24} color="#FAFAFA" />
              </Pressable>
            ),
          }} 
        />
        <ThreadSkeleton />
      </SafeAreaView>
    );
  }

  // Determine if focused post is a reply for header title
  const isReply = thread.focusedPost.is_reply || thread.ancestors.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen 
        options={{ 
          headerShown: true,
          headerTitle: isReply ? "Reply" : "Thread",
          headerStyle: { backgroundColor: "#0A0A0A" },
          headerTintColor: "#FAFAFA",
          headerLeft: () => (
            <Pressable onPress={handleBack} className="p-2 -ml-2 active:opacity-70">
              <ArrowLeft size={24} color="#FAFAFA" />
            </Pressable>
          ),
        }} 
      />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        className="flex-1"
        style={{ flex: 1 }}
      >
        {/* ✅ Post Ribbon: Complete thread visualization */}
        <ThreadRibbon
          thread={thread}
          onLike={handleLike}
          onRepost={handleRepost}
          onReply={(post, username) => startReplyToComment(post.id, username)}
          onMore={handleMore}
        />

        {/* ✅ Diamond Standard: Sticky Reply Bar with haptics */}
        <ReplyBar
          onSend={handleReply}
          isPending={createReply.isPending}
          placeholder={replyTargetId && replyTargetId !== id ? "Reply to comment..." : "Post your reply..."}
          replyTargetUsername={replyTargetId && replyTargetId !== id ? replyTargetUsername : null}
          onCancelTarget={cancelReplyTarget}
          initialText={replyText}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
