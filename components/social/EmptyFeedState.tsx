import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Users, Search, RefreshCw, PenSquare, Globe2 } from "lucide-react-native";

interface EmptyFeedStateProps {
  type: "for-you" | "following" | "federated";
  isLoading: boolean;
  onRetry?: () => void;
}

const configs = {
  "for-you": {
    title: "The feed is quiet...",
    subtitle: "Be the first to break the silence.",
    Icon: PenSquare,
    buttonLabel: "Post Something",
    route: "/compose",
  },
  "following": {
    title: "You aren't following anyone yet",
    subtitle: "Follow friends and creators to see their latest updates here.",
    Icon: Users,
    buttonLabel: "Find People to Follow",
    route: "/search",
  },
  "federated": {
    title: "Global feed unavailable",
    subtitle: "Check your connection or try again later.",
    Icon: Globe2,
    buttonLabel: "Retry",
    route: null, // Handled by onRetry
  },
};

export function EmptyFeedState({ type, isLoading, onRetry }: EmptyFeedStateProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <View className="py-20 items-center justify-center">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  const config = configs[type] || configs["for-you"];
  const { Icon } = config;

  const handlePress = () => {
    if (config.route) {
      router.push(config.route as any);
    } else if (onRetry) {
      onRetry();
    }
  };

  return (
    <View className="flex-1 items-center justify-center px-10 py-20">
      <View className="bg-gray-100 dark:bg-zinc-900 p-6 rounded-full mb-6">
        <Icon size={40} color="#10B981" />
      </View>
      <Text className="text-text-primary text-xl font-bold text-center mb-2">
        {config.title}
      </Text>
      <Text className="text-text-muted text-center mb-8 text-base">
        {config.subtitle}
      </Text>
      <Pressable 
        onPress={handlePress}
        className="bg-primary px-8 py-3 rounded-full active:opacity-80"
      >
        <Text className="text-white font-bold text-lg">{config.buttonLabel}</Text>
      </Pressable>
    </View>
  );
}
