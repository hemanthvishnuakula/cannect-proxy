import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { X } from "lucide-react-native";
import { Image } from "expo-image";

import { useAuthStore } from "@/lib/stores";
import { useRepost, usePost } from "@/lib/hooks";

export default function QuotePostScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const [content, setContent] = useState("");
  const { user } = useAuthStore();
  const repostMutation = useRepost();
  const { data: originalPost, isLoading: isLoadingPost } = usePost(postId || "");

  const charCount = content.length;
  const maxChars = 280;
  const isOverLimit = charCount > maxChars;

  const handleQuote = async () => {
    if (!originalPost) return;
    
    try {
      await repostMutation.mutateAsync({ 
        originalPost, 
        content: content.trim() 
      });
      router.back();
    } catch (error) {
      console.error("Failed to quote post:", error);
    }
  };

  const avatarUrl = originalPost?.author?.avatar_url || 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(originalPost?.author?.username || "U")}&background=10B981&color=fff`;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-3 border-b border-border">
          <Pressable onPress={() => router.back()} className="p-2">
            <X size={24} color="#FAFAFA" />
          </Pressable>
          <Pressable
            onPress={handleQuote}
            disabled={isOverLimit || repostMutation.isPending || !originalPost}
            className={`bg-primary px-5 py-2.5 rounded-full ${isOverLimit ? 'opacity-50' : ''}`}
          >
            {repostMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-semibold text-base">Quote</Text>
            )}
          </Pressable>
        </View>

        {/* Compose Area */}
        <View className="flex-1 px-4 pt-4">
          {/* User Input */}
          <View className="flex-row mb-4">
            <View className="w-11 h-11 rounded-full bg-primary items-center justify-center">
              <Text className="text-white text-lg font-semibold">
                {user?.email?.[0]?.toUpperCase() || "U"}
              </Text>
            </View>
            <TextInput
              placeholder="Add your thoughts..."
              placeholderTextColor="#6B6B6B"
              value={content}
              onChangeText={setContent}
              multiline
              className="flex-1 ml-3 text-lg text-text-primary"
              style={{ textAlignVertical: "top", minHeight: 80 }}
              autoFocus
            />
          </View>

          {/* Embedded Original Post */}
          {isLoadingPost ? (
            <View className="bg-surface-elevated border border-border rounded-xl p-4 items-center justify-center h-32">
              <ActivityIndicator color="#10B981" />
            </View>
          ) : originalPost ? (
            <View className="bg-surface-elevated border border-border rounded-xl p-4">
              {/* Original Author */}
              <View className="flex-row items-center gap-2 mb-2">
                <Image 
                  source={{ uri: avatarUrl }} 
                  style={{ width: 24, height: 24, borderRadius: 12 }} 
                />
                <Text className="font-semibold text-sm text-text-primary">
                  {originalPost.author?.display_name || originalPost.author?.username}
                </Text>
                <Text className="text-text-muted text-sm">
                  @{originalPost.author?.username}
                </Text>
              </View>
              
              {/* Original Content */}
              <Text className="text-text-primary text-base leading-5" numberOfLines={4}>
                {originalPost.content}
              </Text>

              {/* Original Media Preview */}
              {originalPost.media_urls && originalPost.media_urls.length > 0 && (
                <View className="mt-3 rounded-lg overflow-hidden border border-border">
                  <Image
                    source={{ uri: originalPost.media_urls[0] }}
                    style={{ width: "100%", height: 120 }}
                    contentFit="cover"
                  />
                </View>
              )}
            </View>
          ) : (
            <View className="bg-surface-elevated border border-border rounded-xl p-4 items-center">
              <Text className="text-text-muted">Post not found</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View className="flex-row justify-end items-center px-4 py-3 border-t border-border">
          <Text className={`text-sm ${isOverLimit ? 'text-accent-error' : 'text-text-muted'}`}>
            {charCount}/{maxChars}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
