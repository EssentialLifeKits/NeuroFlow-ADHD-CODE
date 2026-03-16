import React from 'react';
import { Platform, View, Image, Text, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';

export function TaskThumbnail({ stickerId, fallbackEmoji, color }: { stickerId?: string | null, fallbackEmoji: string, color: string }) {
  if (stickerId && stickerId.startsWith('{')) {
    try {
      const p = JSON.parse(stickerId);
      if (p.uri) {
        if (p.type === 'video') {
          // On web, expo-av cannot seek a data: URI to a specific frame.
          // Use a native <video> element positioned at thumbTime (in seconds).
          if (Platform.OS === 'web') {
            const thumbSec = (p.thumbTime || 0) / 1000;
            return (
              <View style={[styles.container, { borderColor: color }]}>
                {React.createElement('video', {
                  src: p.uri,
                  style: {
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  },
                  muted: true,
                  preload: 'metadata',
                  // currentTime is set via ref after mount
                  ref: (el: HTMLVideoElement | null) => {
                    if (el && Number.isFinite(thumbSec)) {
                      el.currentTime = thumbSec;
                    }
                  },
                })}
              </View>
            );
          }
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
        } else if (p.type === 'document') {
          // Documents: show a doc icon with a coloured background — no preview possible in a 40×40 thumb
          return (
            <View style={[styles.container, { borderColor: color, backgroundColor: color + '22', justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ fontSize: 20 }}>📄</Text>
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
    backgroundColor: '#000',
  },
});
