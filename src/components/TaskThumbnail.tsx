import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

export function TaskThumbnail({ stickerId, fallbackEmoji, color }: { stickerId?: string | null, fallbackEmoji: string, color: string }) {
  if (stickerId && stickerId.startsWith('{')) {
    try {
      const p = JSON.parse(stickerId);
      if (p.type === 'video') {
        // Show canvas-captured thumbnail JPEG if available; otherwise show camera emoji
        const thumb = p.thumbnail;
        if (thumb) {
          return (
            <View style={[styles.container, { borderColor: color }]}>
              <Image source={{ uri: thumb }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            </View>
          );
        }
        return (
          <View style={[styles.container, { borderColor: color, backgroundColor: color + '22', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 20 }}>🎬</Text>
          </View>
        );
      } else if (p.type === 'image' && p.uri) {
        return (
          <View style={[styles.container, { borderColor: color }]}>
            <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          </View>
        );
      } else if (p.type === 'document') {
        // Documents: always show 📄 icon — no preview possible in a 40×40 thumb
        return (
          <View style={[styles.container, { borderColor: color, backgroundColor: color + '22', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 20 }}>📄</Text>
          </View>
        );
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
    backgroundColor: '#000',
  },
});
