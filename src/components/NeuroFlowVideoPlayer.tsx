import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, radius } from '../constants/theme';

type Props = {
  url: string;
  accentColor?: string;
  title?: string;
  showOpenButton?: boolean;
};

function getGoogleDriveEmbedUrl(url: string): string {
  if (!url.includes('drive.google.com')) return url;
  if (url.includes('/preview')) return url;
  const match = url.match(/\/file\/d\/([^/?#]+)/);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  return url;
}

function getGoogleDriveFileId(url: string): string | null {
  return url.match(/\/file\/d\/([^/?#]+)/)?.[1] ?? url.match(/[?&]id=([^&#]+)/)?.[1] ?? null;
}

function getVideoDownloadUrl(url: string): string {
  if (!url.includes('drive.google.com')) return url;
  const id = getGoogleDriveFileId(url);
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
}

// Mobile: scale the Drive iframe down so its chrome is hidden and the video fills the box.
// Desktop: simple 100% fill.
// IMPORTANT: Do NOT add CSS filter to the iframe — it has no effect on iframe content
// and causes unnecessary compositing overhead.
function getDrivePreviewFrameStyle(isPhone: boolean) {
  if (!isPhone) {
    return {
      width: '100%',
      height: '100%',
      borderRadius: 12,
      backgroundColor: '#000',
      border: 'none',
    };
  }

  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '138%',
    height: '138%',
    transform: 'translate(-50%, -50%) scale(0.725)',
    transformOrigin: 'center center',
    borderRadius: 12,
    backgroundColor: '#000',
    border: 'none',
  };
}

function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

export default function NeuroFlowVideoPlayer({
  url,
  accentColor = '#FBBF24',
  title = 'Video Player',
  showOpenButton = true,
}: Props) {
  const videoRef = useRef<any>(null);
  const playerContainerRef = useRef<any>(null);
  const { width } = useWindowDimensions();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isDriveLink = url.includes('drive.google.com');
  const embedUrl = isDriveLink ? getGoogleDriveEmbedUrl(url) : url;
  const downloadUrl = getVideoDownloadUrl(url);
  // Only use native <video> for direct video file URLs (mp4/mov/webm).
  // Drive links always use the iframe embed — it handles auth and playback reliably.
  const shouldUseNativeVideo = isDirectVideoUrl(url) && !isDriveLink;
  const isPhone = width <= 480;
  const playerMaxWidth = isPhone ? 296 : '100%';
  const playerHeight = isPhone ? 167 : 320;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('nf-hide-video-fs-btn')) {
      const s = document.createElement('style');
      s.id = 'nf-hide-video-fs-btn';
      // Only hide the browser fullscreen button — do NOT override timeline position
      // or controls panel color (those changes break mobile layout).
      s.textContent = 'video::-webkit-media-controls-fullscreen-button { display: none !important; }';
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (videoRef.current) videoRef.current.pause();
      };
    }, []),
  );

  const openFullscreen = () => {
    const el = playerContainerRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
  };

  const exitFullscreen = () => {
    if (document.exitFullscreen) document.exitFullscreen();
    else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
  };

  if (Platform.OS !== 'web') {
    return (
      <Pressable onPress={() => Linking.openURL(downloadUrl)} style={[styles.downloadBtn, { backgroundColor: accentColor }]}>
        <Text style={styles.downloadIcon}>▶️</Text>
        <View>
          <Text style={styles.downloadLabel}>Download in Google Drive</Text>
          <Text style={styles.downloadSub}>Opens in your device player</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>▶ Video Player</Text>
        <Pressable onPress={openFullscreen} style={[styles.toolbarBtn, { borderColor: accentColor }]}>
          <Text style={[styles.toolbarBtnText, { color: accentColor }]}>⛶ Full Screen</Text>
        </Pressable>
      </View>

      <View style={[styles.frame, styles.videoFrame, isPhone && styles.videoFrameMobile, { height: playerHeight, maxWidth: playerMaxWidth as any }]}>
        {shouldUseNativeVideo
          ? React.createElement('div', {
              ref: playerContainerRef,
              style: { position: 'relative', width: '100%', height: '100%', backgroundColor: '#000', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
            },
              React.createElement('video', {
                ref: videoRef,
                src: url,
                controls: true,
                controlsList: 'nodownload',
                playsInline: true,
                // IMPORTANT: Do NOT add CSS filter to <video> elements.
                // CSS filter forces a new GPU compositing layer on video, which renders
                // as solid black in Safari/WebKit. Keep the style clean.
                style: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: '#000', outline: 'none', display: 'block', objectFit: 'contain' },
                preload: 'metadata',
              }),
              React.createElement('button', {
                onClick: exitFullscreen,
                style: { display: isFullscreen ? 'flex' : 'none', position: 'absolute', top: 16, right: 16, zIndex: 9999, padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.5)', backgroundColor: 'rgba(248,113,113,0.12)', color: '#F87171', cursor: 'pointer', fontSize: 14, fontWeight: 700, alignItems: 'center', gap: 8 },
              }, '✕ Exit Full Screen'),
            )
          : React.createElement('div', {
              ref: playerContainerRef,
              style: { position: 'relative', width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 12 },
            },
              React.createElement('iframe', {
                src: embedUrl,
                frameBorder: 0,
                allow: 'autoplay; fullscreen',
                title,
                style: getDrivePreviewFrameStyle(isPhone),
              }),
              React.createElement('div', {
                style: { position: 'absolute', bottom: 0, right: 0, width: 56, height: 56, zIndex: 10, cursor: 'default' },
                onClick: (e: any) => e.stopPropagation(),
              }),
              React.createElement('button', {
                onClick: exitFullscreen,
                style: { display: isFullscreen ? 'flex' : 'none', position: 'absolute', top: 16, right: 16, zIndex: 9999, padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.5)', backgroundColor: 'rgba(248,113,113,0.12)', color: '#F87171', cursor: 'pointer', fontSize: 14, fontWeight: 700, alignItems: 'center', gap: 8 },
              }, '✕ Exit Full Screen'),
            )
        }
      </View>

      {showOpenButton && (
        <Pressable onPress={() => Linking.openURL(downloadUrl)} style={[styles.downloadBtnFull, { backgroundColor: accentColor }]}>
          <Text style={{ fontSize: 16 }}>📥</Text>
          <Text style={styles.downloadBtnFullText}>Download in Google Drive</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  toolbarLabel: { fontSize: 11, color: colors.textTertiary, flex: 1 },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1.5 },
  toolbarBtnText: { fontSize: 12, fontWeight: '700' },
  frame: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1a2e', position: 'relative' },
  videoFrame: { backgroundColor: '#000' },
  videoFrameMobile: { alignSelf: 'center' },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 24, borderRadius: radius.xl, marginTop: 8 },
  downloadIcon: { fontSize: 22 },
  downloadLabel: { fontSize: 16, fontWeight: '800', color: '#fff' },
  downloadSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  downloadBtnFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: radius.lg, marginTop: 2 },
  downloadBtnFullText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
