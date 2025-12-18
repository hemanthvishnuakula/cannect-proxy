import React, { useState } from 'react';
import { View, ScrollView, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from 'react-native';
import { PostMedia } from './PostMedia';

interface PostCarouselProps {
  mediaUrls: string[];
  isFederated?: boolean;
}

export function PostCarousel({ mediaUrls, isFederated = false }: PostCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  
  // Padding adjustment to match feed's horizontal margins (px-4 = 16px each side)
  const carouselWidth = windowWidth - 32; 

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollOffset / carouselWidth);
    if (index !== activeIndex) setActiveIndex(index);
  };

  if (!mediaUrls || mediaUrls.length === 0) return null;

  // Single image: render directly without carousel overhead
  if (mediaUrls.length === 1) {
    return (
      <View className="mt-3">
        <PostMedia uri={mediaUrls[0]} isFederated={isFederated} />
      </View>
    );
  }

  // Multiple images: horizontal paging carousel
  return (
    <View className="mt-3">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={carouselWidth}
        disableIntervalMomentum
      >
        {mediaUrls.map((url, index) => (
          <View key={`${url}-${index}`} style={{ width: carouselWidth }}>
            <PostMedia uri={url} isFederated={isFederated} />
          </View>
        ))}
      </ScrollView>

      {/* Pagination Dots */}
      <View className="flex-row justify-center gap-1.5 mt-2">
        {mediaUrls.map((_, index) => (
          <View
            key={index}
            className={`h-1.5 rounded-full ${
              index === activeIndex ? "w-4 bg-primary" : "w-1.5 bg-border"
            }`}
          />
        ))}
      </View>
    </View>
  );
}
