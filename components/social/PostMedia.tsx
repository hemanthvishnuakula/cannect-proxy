import React, { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { BLURHASH_PLACEHOLDERS } from '@/lib/utils/assets';

const MAX_HEIGHT = 500; // Prevent ultra-tall images from taking over the screen

interface PostMediaProps {
  uri: string;
  isFederated?: boolean;
}

export function PostMedia({ uri, isFederated = false }: PostMediaProps) {
  // Start with a safe 4:3 placeholder ratio (common photo aspect)
  const [aspectRatio, setAspectRatio] = useState(4 / 3);

  return (
    <View 
      className="overflow-hidden rounded-2xl bg-surface/50 border border-border/50"
      style={{ 
        width: '100%', 
        aspectRatio: aspectRatio,
        maxHeight: MAX_HEIGHT 
      }}
    >
      <Image
        source={uri}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        placeholder={isFederated ? BLURHASH_PLACEHOLDERS.GLOBAL : BLURHASH_PLACEHOLDERS.NEUTRAL}
        transition={300}
        cachePolicy="memory-disk"
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width && height) {
            // ✅ Diamond Standard: Calculate exact aspect ratio
            setAspectRatio(width / height);
          }
        }}
      />
    </View>
  );
}
