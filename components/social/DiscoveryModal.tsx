import { useState, useEffect } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { X, Users, Sparkles } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProfileRow } from "@/components/Profile/ProfileRow";
import { useSearchUsers } from "@/lib/hooks";

interface DiscoveryModalProps {
  isVisible: boolean;
  onClose: () => void;
}

const DISCOVERY_SHOWN_KEY = "@cannect/discovery_shown";

export function DiscoveryModal({ isVisible, onClose }: DiscoveryModalProps) {
  // Fetch suggested users - in production, this would be a curated list
  // For now, we'll search for popular/recent users
  const { data: suggestedUsers, isLoading } = useSearchUsers("");
  
  const handleClose = async () => {
    // Mark as shown so we don't annoy the user again
    await AsyncStorage.setItem(DISCOVERY_SHOWN_KEY, "true");
    onClose();
  };

  return (
    <Modal 
      visible={isVisible} 
      animationType="slide" 
      transparent
      statusBarTranslucent
    >
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-background w-full h-[70%] rounded-t-3xl">
          {/* Header */}
          <View className="flex-row justify-between items-start p-6 pb-4 border-b border-border">
            <View className="flex-1 pr-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Sparkles size={24} color="#10B981" />
                <Text className="text-text-primary text-2xl font-bold">
                  Find your circle
                </Text>
              </View>
              <Text className="text-text-muted text-base">
                Follow a few people to fill your feed with content you'll love.
              </Text>
            </View>
            <Pressable 
              onPress={handleClose} 
              className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full"
            >
              <X size={20} color="#6B7280" />
            </Pressable>
          </View>

          {/* User List */}
          <ScrollView 
            className="flex-1 px-4"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 12 }}
          >
            {isLoading ? (
              <View className="py-12 items-center">
                <ActivityIndicator size="large" color="#10B981" />
                <Text className="text-text-muted mt-4">Finding people for you...</Text>
              </View>
            ) : suggestedUsers && suggestedUsers.length > 0 ? (
              suggestedUsers.slice(0, 10).map((user) => (
                <ProfileRow 
                  key={user.id} 
                  profile={user} 
                  showFollowButton={true}
                />
              ))
            ) : (
              <View className="py-12 items-center">
                <Users size={48} color="#6B7280" />
                <Text className="text-text-muted mt-4 text-center">
                  No suggestions available right now.{"\n"}
                  Try searching for people you know!
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Done Button */}
          <View className="p-6 pt-4 border-t border-border">
            <Pressable 
              onPress={handleClose}
              className="bg-primary w-full py-4 rounded-xl items-center active:opacity-80"
            >
              <Text className="text-white font-bold text-lg">Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Hook to manage discovery modal state
export function useDiscoveryModal(followingCount: number | undefined) {
  const [showDiscovery, setShowDiscovery] = useState(false);
  
  useEffect(() => {
    const checkShouldShow = async () => {
      // Only show if user follows 0 people
      if (followingCount !== 0) return;
      
      // Check if we've already shown this
      const hasShown = await AsyncStorage.getItem(DISCOVERY_SHOWN_KEY);
      if (hasShown === "true") return;
      
      // Show the modal
      setShowDiscovery(true);
    };
    
    checkShouldShow();
  }, [followingCount]);
  
  return {
    showDiscovery,
    closeDiscovery: () => setShowDiscovery(false),
  };
}
