import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';

export function TaskThumbnail({ stickerId, fallbackEmoji, color }: { stickerId?: string | null, fallbackEmoji: string, color: string }) {
  if (stickerId && stickerId.startsWith('{')) {
    try {
      const p = JSON.parse(stickerId);
      if (p.uri) {
        if (p.type === 'video') {
          return (
            <View style={[styles.container, { borderColor: color }]}>
              <Video 
                source={{ uri: p.uri }} 
                style={StyleSheet.absoluteFillObject} 
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
                positionMillis={p.thumbTime || 0}
                isMuted={true}
              />
            </View>
          );
        } else if (p.type === 'image') {
          return (
            <View style={[styles.container, { borderColor: color }]}>
              <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            </View>
          );
        }
      }
    } catch {}
  }
  
  return (
    <View style={[styles.container, { borderColor: color, backgroundColor: color + '11', justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ fontSize: 18 }}>{fallbackEmoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#000'
  }
});
