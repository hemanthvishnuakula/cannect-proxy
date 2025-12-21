import { Modal, View, Text, Pressable } from "react-native";
import { Repeat2, Quote, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

interface RepostMenuProps {
  isVisible: boolean;
  onClose: () => void;
  onRepost: () => void;
  onQuotePost: () => void;
  isReposted?: boolean;
}

export function RepostMenu({ 
  isVisible, 
  onClose, 
  onRepost, 
  onQuotePost,
  isReposted = false 
}: RepostMenuProps) {
  
  const handleRepost = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onRepost();
    onClose();
  };

  const handleQuotePost = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onQuotePost();
    onClose();
  };

  return (
    <Modal 
      visible={isVisible} 
      animationType="slide" 
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable 
        className="flex-1 bg-black/50" 
        onPress={onClose}
      />
      
      {/* Bottom Sheet */}
      <View className="bg-surface-elevated rounded-t-3xl pb-8 pt-2">
        {/* Handle Bar */}
        <View className="items-center py-3">
          <View className="w-10 h-1 bg-zinc-600 rounded-full" />
        </View>

        {/* Menu Options */}
        <View className="px-4 pb-4">
          {/* Repost Option */}
          <Pressable
            onPress={handleRepost}
            className="flex-row items-center gap-4 py-4 px-4 rounded-xl active:bg-zinc-800/50"
          >
            <View className={`w-11 h-11 rounded-full items-center justify-center ${isReposted ? 'bg-primary/20' : 'bg-zinc-800'}`}>
              <Repeat2 size={22} color={isReposted ? "#10B981" : "#FAFAFA"} />
            </View>
            <View className="flex-1">
              <Text className={`text-lg font-semibold ${isReposted ? 'text-primary' : 'text-text-primary'}`}>
                {isReposted ? "Undo Repost" : "Repost"}
              </Text>
              <Text className="text-text-muted text-sm">
                {isReposted ? "Remove from your profile" : "Share to your followers instantly"}
              </Text>
            </View>
          </Pressable>

          {/* Quote Post Option - only show if not already reposted */}
          {!isReposted && (
            <Pressable
              onPress={handleQuotePost}
              className="flex-row items-center gap-4 py-4 px-4 rounded-xl active:bg-zinc-800/50"
            >
              <View className="w-11 h-11 rounded-full bg-zinc-800 items-center justify-center">
                <Quote size={22} color="#FAFAFA" />
              </View>
              <View className="flex-1">
                <Text className="text-text-primary text-lg font-semibold">
                  Quote Post
                </Text>
                <Text className="text-text-muted text-sm">
                  Add your thoughts with the original post
                </Text>
              </View>
            </Pressable>
          )}
        </View>

        {/* Cancel Button */}
        <View className="px-4">
          <Pressable
            onPress={onClose}
            className="py-4 rounded-xl bg-zinc-800 items-center active:bg-zinc-700"
          >
            <Text className="text-text-primary font-semibold text-base">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
