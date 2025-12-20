-- ============================================================================
-- CANNECT FRESH DATABASE SCHEMA
-- ============================================================================
-- Run this in Supabase SQL Editor to create a clean database
-- 
-- Step 1: Drop all existing tables (run this first if needed)
-- Step 2: Create fresh schema with all columns and triggers
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP EVERYTHING (DESTRUCTIVE - removes all data!)
-- ============================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_update_post_likes ON likes;
DROP TRIGGER IF EXISTS trigger_update_follow_counts ON follows;
DROP TRIGGER IF EXISTS trigger_update_profile_posts ON posts;
DROP TRIGGER IF EXISTS trigger_create_like_notification ON likes;
DROP TRIGGER IF EXISTS trigger_create_follow_notification ON follows;
DROP TRIGGER IF EXISTS trigger_update_comments_count_insert ON posts;
DROP TRIGGER IF EXISTS trigger_update_comments_count_delete ON posts;
DROP TRIGGER IF EXISTS trigger_update_reposts_count_insert ON posts;
DROP TRIGGER IF EXISTS trigger_update_reposts_count_delete ON posts;
DROP TRIGGER IF EXISTS trigger_create_comment_notification ON posts;
DROP TRIGGER IF EXISTS trigger_create_repost_notification ON posts;
DROP TRIGGER IF EXISTS trigger_notify_push ON notifications;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop functions
DROP FUNCTION IF EXISTS update_post_likes_count() CASCADE;
DROP FUNCTION IF EXISTS update_follow_counts() CASCADE;
DROP FUNCTION IF EXISTS update_profile_posts_count() CASCADE;
DROP FUNCTION IF EXISTS create_like_notification() CASCADE;
DROP FUNCTION IF EXISTS create_follow_notification() CASCADE;
DROP FUNCTION IF EXISTS update_parent_comments_count() CASCADE;
DROP FUNCTION IF EXISTS create_comment_notification() CASCADE;
DROP FUNCTION IF EXISTS update_post_reposts_count() CASCADE;
DROP FUNCTION IF EXISTS create_repost_notification() CASCADE;
DROP FUNCTION IF EXISTS notify_push_notification() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS follows CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================================================
-- STEP 2: ENABLE EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_net";  -- For async HTTP calls (push notifications)

-- ============================================================================
-- STEP 3: CREATE TABLES
-- ============================================================================

-- PROFILES TABLE
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  bio TEXT,
  website TEXT,
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  posts_count INTEGER DEFAULT 0 NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE NOT NULL,
  expo_push_token TEXT,
  web_push_subscription JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON COLUMN profiles.cover_url IS 'URL to the user profile cover/banner image';
COMMENT ON COLUMN profiles.expo_push_token IS 'Expo push token for native app notifications';
COMMENT ON COLUMN profiles.web_push_subscription IS 'Web Push API subscription object (endpoint, keys)';

-- POSTS TABLE
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  media_urls TEXT[],
  video_url TEXT,
  video_thumbnail_url TEXT,
  likes_count INTEGER DEFAULT 0 NOT NULL,
  comments_count INTEGER DEFAULT 0 NOT NULL,
  reposts_count INTEGER DEFAULT 0 NOT NULL,
  is_reply BOOLEAN DEFAULT FALSE NOT NULL,
  reply_to_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  is_repost BOOLEAN DEFAULT FALSE NOT NULL,
  repost_of_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'post' NOT NULL CHECK (type IN ('post', 'repost', 'quote')),
  -- External/federated content fields
  external_id TEXT,
  external_source TEXT,
  external_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON COLUMN posts.video_url IS 'Cloudflare Stream HLS playback URL';
COMMENT ON COLUMN posts.video_thumbnail_url IS 'Cloudflare Stream auto-generated thumbnail';
COMMENT ON COLUMN posts.type IS 'post = normal, repost = simple repost, quote = quote tweet';
COMMENT ON COLUMN posts.external_id IS 'External platform post ID (e.g., Bluesky URI)';
COMMENT ON COLUMN posts.external_source IS 'Source platform (e.g., bluesky)';
COMMENT ON COLUMN posts.external_metadata IS 'Cached metadata from external platform';

-- LIKES TABLE
CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, post_id)
);

-- FOLLOWS TABLE
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- NOTIFICATIONS TABLE
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like', 'follow', 'comment', 'repost', 'mention')),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- STEP 4: CREATE INDEXES
-- ============================================================================

-- Posts indexes
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_reply_to_id ON posts(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX idx_posts_repost_of_id ON posts(repost_of_id) WHERE repost_of_id IS NOT NULL;
CREATE INDEX idx_posts_external_id ON posts(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_posts_has_media ON posts(user_id, created_at DESC) WHERE media_urls IS NOT NULL OR video_url IS NOT NULL;

-- Feed index for followed users
CREATE INDEX idx_posts_feed ON posts(user_id, created_at DESC) WHERE is_reply = FALSE;

-- Unique constraint to prevent duplicate reposts
CREATE UNIQUE INDEX idx_unique_repost ON posts(user_id, repost_of_id) WHERE type = 'repost' AND repost_of_id IS NOT NULL;

-- Likes indexes
CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);

-- Follows indexes
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- Notifications indexes
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;

-- Profile push token indexes
CREATE INDEX idx_profiles_push_token ON profiles(expo_push_token) WHERE expo_push_token IS NOT NULL;
CREATE INDEX idx_profiles_web_push ON profiles(id) WHERE web_push_subscription IS NOT NULL;

-- ============================================================================
-- STEP 5: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 6: CREATE RLS POLICIES
-- ============================================================================

-- PROFILES POLICIES
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- POSTS POLICIES
CREATE POLICY "Posts are viewable by everyone"
  ON posts FOR SELECT
  USING (true);

CREATE POLICY "Users can create own posts"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  USING (auth.uid() = user_id);

-- LIKES POLICIES
CREATE POLICY "Likes are viewable by everyone"
  ON likes FOR SELECT
  USING (true);

CREATE POLICY "Users can like posts"
  ON likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike posts"
  ON likes FOR DELETE
  USING (auth.uid() = user_id);

-- FOLLOWS POLICIES
CREATE POLICY "Follows are viewable by everyone"
  ON follows FOR SELECT
  USING (true);

CREATE POLICY "Users can follow others"
  ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow others"
  ON follows FOR DELETE
  USING (auth.uid() = follower_id);

-- NOTIFICATIONS POLICIES
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- System can insert notifications (uses SECURITY DEFINER functions)
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- STEP 7: CREATE TRIGGER FUNCTIONS
-- ============================================================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Update likes count on posts
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Update follower/following counts
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    UPDATE profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Update posts count on profiles
CREATE OR REPLACE FUNCTION update_profile_posts_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only count non-replies for posts_count
    IF NEW.is_reply = FALSE THEN
      UPDATE profiles SET posts_count = posts_count + 1 WHERE id = NEW.user_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_reply = FALSE THEN
      UPDATE profiles SET posts_count = GREATEST(0, posts_count - 1) WHERE id = OLD.user_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Update comments count on parent post
CREATE OR REPLACE FUNCTION update_parent_comments_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reply_to_id IS NOT NULL THEN
      UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.reply_to_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.reply_to_id IS NOT NULL THEN
      UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.reply_to_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Update reposts count on original post
CREATE OR REPLACE FUNCTION update_post_reposts_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'repost' AND NEW.repost_of_id IS NOT NULL THEN
      UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.repost_of_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.type = 'repost' AND OLD.repost_of_id IS NOT NULL THEN
      UPDATE posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.repost_of_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create notification on like
CREATE OR REPLACE FUNCTION create_like_notification()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  post_author_id UUID;
BEGIN
  SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  
  -- Don't notify if liking own post
  IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, actor_id, type, post_id)
    VALUES (post_author_id, NEW.user_id, 'like', NEW.post_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create notification on follow
CREATE OR REPLACE FUNCTION create_follow_notification()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;

-- Create notification on comment/reply
CREATE OR REPLACE FUNCTION create_comment_notification()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  parent_author_id UUID;
BEGIN
  IF NEW.reply_to_id IS NOT NULL THEN
    SELECT user_id INTO parent_author_id FROM posts WHERE id = NEW.reply_to_id;
    
    -- Don't notify if replying to own post
    IF parent_author_id IS NOT NULL AND parent_author_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, actor_id, type, post_id)
      VALUES (parent_author_id, NEW.user_id, 'comment', NEW.id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create notification on repost
CREATE OR REPLACE FUNCTION create_repost_notification()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  original_author_id UUID;
BEGIN
  IF NEW.type = 'repost' AND NEW.repost_of_id IS NOT NULL THEN
    SELECT user_id INTO original_author_id FROM posts WHERE id = NEW.repost_of_id;
    
    -- Don't notify if reposting own post
    IF original_author_id IS NOT NULL AND original_author_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, actor_id, type, post_id)
      VALUES (original_author_id, NEW.user_id, 'repost', NEW.repost_of_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Push notification via Edge Function
CREATE OR REPLACE FUNCTION notify_push_notification()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  actor_name TEXT;
  actor_username TEXT;
  notification_title TEXT;
  notification_body TEXT;
  notification_data JSONB;
  edge_function_url TEXT;
BEGIN
  -- Get your Supabase URL (replace with your actual URL)
  edge_function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push-notification';
  
  -- Fallback if setting not available
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    -- You should replace this with your actual Supabase URL
    edge_function_url := 'https://luljncadylctsrkqtatk.supabase.co/functions/v1/send-push-notification';
  END IF;

  -- Get the actor's display name and username
  SELECT 
    COALESCE(display_name, username, 'Someone'),
    username
  INTO actor_name, actor_username
  FROM profiles
  WHERE id = NEW.actor_id;

  -- Build notification content based on type
  CASE NEW.type
    WHEN 'like' THEN
      notification_title := '❤️ New Like';
      notification_body := actor_name || ' liked your post';
      notification_data := jsonb_build_object(
        'type', 'like',
        'postId', NEW.post_id,
        'notificationId', NEW.id
      );
    WHEN 'comment' THEN
      notification_title := '💬 New Comment';
      notification_body := actor_name || ' commented on your post';
      notification_data := jsonb_build_object(
        'type', 'comment',
        'postId', NEW.post_id,
        'notificationId', NEW.id
      );
    WHEN 'follow' THEN
      notification_title := '👤 New Follower';
      notification_body := actor_name || ' started following you';
      notification_data := jsonb_build_object(
        'type', 'follow',
        'actorId', NEW.actor_id,
        'actorUsername', actor_username,
        'notificationId', NEW.id
      );
    WHEN 'repost' THEN
      notification_title := '🔄 New Repost';
      notification_body := actor_name || ' reposted your post';
      notification_data := jsonb_build_object(
        'type', 'repost',
        'postId', NEW.post_id,
        'notificationId', NEW.id
      );
    ELSE
      RETURN NEW;
  END CASE;

  -- Queue the push notification via pg_net (async HTTP call)
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'userId', NEW.user_id,
      'title', notification_title,
      'body', notification_body,
      'data', notification_data
    )::text
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the trigger
    RAISE WARNING 'Push notification error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 8: CREATE TRIGGERS
-- ============================================================================

-- Auto-create profile on auth signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Likes count trigger
CREATE TRIGGER trigger_update_post_likes
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

-- Follow counts trigger
CREATE TRIGGER trigger_update_follow_counts
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- Posts count trigger
CREATE TRIGGER trigger_update_profile_posts
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_profile_posts_count();

-- Comments count triggers
CREATE TRIGGER trigger_update_comments_count_insert
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.reply_to_id IS NOT NULL)
  EXECUTE FUNCTION update_parent_comments_count();

CREATE TRIGGER trigger_update_comments_count_delete
  AFTER DELETE ON posts
  FOR EACH ROW
  WHEN (OLD.reply_to_id IS NOT NULL)
  EXECUTE FUNCTION update_parent_comments_count();

-- Reposts count triggers
CREATE TRIGGER trigger_update_reposts_count_insert
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.type = 'repost' AND NEW.repost_of_id IS NOT NULL)
  EXECUTE FUNCTION update_post_reposts_count();

CREATE TRIGGER trigger_update_reposts_count_delete
  AFTER DELETE ON posts
  FOR EACH ROW
  WHEN (OLD.type = 'repost' AND OLD.repost_of_id IS NOT NULL)
  EXECUTE FUNCTION update_post_reposts_count();

-- Notification triggers
CREATE TRIGGER trigger_create_like_notification
  AFTER INSERT ON likes
  FOR EACH ROW EXECUTE FUNCTION create_like_notification();

CREATE TRIGGER trigger_create_follow_notification
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION create_follow_notification();

CREATE TRIGGER trigger_create_comment_notification
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.reply_to_id IS NOT NULL)
  EXECUTE FUNCTION create_comment_notification();

CREATE TRIGGER trigger_create_repost_notification
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.type = 'repost' AND NEW.repost_of_id IS NOT NULL)
  EXECUTE FUNCTION create_repost_notification();

-- Push notification trigger
CREATE TRIGGER trigger_notify_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_push_notification();

-- ============================================================================
-- DONE! 
-- ============================================================================
-- Your fresh Cannect database is ready with:
-- ✅ profiles (with push tokens, cover images)
-- ✅ posts (with replies, reposts, quotes, videos, external content)
-- ✅ likes (with unique constraint)
-- ✅ follows (with unique constraint, self-follow prevention)
-- ✅ notifications (like, follow, comment, repost, mention)
-- ✅ All count triggers (likes, comments, reposts, followers, posts)
-- ✅ All notification triggers (creates notifications automatically)
-- ✅ Push notification trigger (sends to Edge Function)
-- ✅ Auto-create profile on signup
-- ✅ Row Level Security policies
-- ============================================================================
