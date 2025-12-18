import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { PostWithAuthor } from '@/lib/types/database';

interface PostShareCardProps {
  post: PostWithAuthor;
}

/**
 * PostShareCard - A beautiful branded card for Instagram Stories sharing
 * 
 * This component is rendered off-screen and captured as an image
 * using react-native-view-shot. The 9:16 aspect ratio is optimized
 * for Instagram/TikTok Stories.
 * 
 * Design: Minimalist dark theme with high contrast for maximum readability
 */
export function PostShareCard({ post }: PostShareCardProps) {
  // Get author info (handle both local and federated posts)
  const author = post.author || (post as any).profiles;
  const displayName = author?.display_name || author?.username || 'Unknown';
  const username = author?.username || 'unknown';
  const avatarUrl = author?.avatar_url;

  // Truncate content if too long
  const maxContentLength = 280;
  const truncatedContent = post.content && post.content.length > maxContentLength
    ? post.content.substring(0, maxContentLength) + '...'
    : post.content;

  return (
    <View style={styles.container}>
      {/* Branding Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>C</Text>
        </View>
        <Text style={styles.brandName}>Cannect</Text>
      </View>

      {/* Main Post Card */}
      <View style={styles.card}>
        {/* Author Info */}
        <View style={styles.userInfo}>
          {avatarUrl ? (
            <Image 
              source={avatarUrl} 
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.userText}>
            <Text style={styles.displayName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.username} numberOfLines={1}>
              @{username}
            </Text>
          </View>
        </View>

        {/* Post Content */}
        {truncatedContent && (
          <Text style={styles.content}>
            {truncatedContent}
          </Text>
        )}

        {/* Media Preview (first image only) */}
        {post.media_urls && post.media_urls.length > 0 && (
          <Image 
            source={post.media_urls[0]} 
            style={styles.mediaPreview}
            contentFit="cover"
          />
        )}
      </View>

      {/* Footer / Call to Action */}
      <Text style={styles.footer}>Join the conversation on Cannect</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 400,
    aspectRatio: 9 / 16,
    padding: 40,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#3B82F6', // brand blue
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  brandName: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginLeft: 12,
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: '#0A0A0A',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  userText: {
    marginLeft: 12,
    flex: 1,
  },
  displayName: {
    color: 'white',
    fontWeight: '700',
    fontSize: 18,
  },
  username: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 2,
  },
  content: {
    color: 'white',
    fontSize: 20,
    lineHeight: 28,
    marginBottom: 16,
  },
  mediaPreview: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginTop: 8,
  },
  footer: {
    color: '#4B5563',
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
