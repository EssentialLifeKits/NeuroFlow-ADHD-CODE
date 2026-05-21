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

// For native <video> streaming from Drive: use the usercontent subdomain with confirm=t
// to bypass the virus-scan interstitial. This serves the file directly as a video stream.
// Requires the Drive file to be shared "Anyone with the link".
function getDriveStreamUrl(url: string): string {
  const id = getGoogleDriveFileId(url);
  if (!id) return url;
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&authuser=0&confirm=t`;
}

// Desktop iframe: simple 100% fill. (Mobile uses native <video> — no iframe styling needed.)
function getDrivePreviewFrameStyle(): React.CSSProperties {
  return { width: '100%', height: '100%', border: 'none', backgroundColor: '#000' };
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
  const [showPlayer, setShowPlayer] = useState(true); // X button toggles this

  const isDriveLink = url.includes('drive.google.com');
  const embedUrl = isDriveLink ? getGoogleDriveEmbedUrl(url) : url;
  const downloadUrl = getVideoDownloadUrl(url);
  const isPhone = width <= 480;

  // MOBILE FIX: On mobile, bypass Drive's broken /preview iframe (which puts the
  // scrubber at top, applies a dark overlay, and hides bottom controls). Instead
  // use a native <video> element with Drive's direct streaming URL — this gives
  // iOS Safari's built-in controls (scrubber at bottom, all buttons accessible).
  //
  // DESKTOP: unchanged — keeps the iframe embed (works fine on desktop).
  const shouldUseNativeVideo = isDirectVideoUrl(url) || (isDriveLink && isPhone);
  const videoSrc =
    isDriveLink && shouldUseNativeVideo ? getDriveStreamUrl(url) : url;

  // Mobile: full container width, height matches 16:9 of available width.
  // Desktop: unchanged (320px tall, 100% wide).
  const playerMaxWidth = '100%';
  const playerHeight = isPhone ? Math.round(Math.min(width, 560) * 9 / 16) : 320;

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

  // X button: stops playback, resets to start, and unloads the iframe/video.
  // User can click anywhere on the placeholder to bring the player back.
  const closePlayer = () => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      } catch {}
    }
    setShowPlayer(false);
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
        {!showPlayer
          ? React.createElement('div', {
              onClick: () => setShowPlayer(true),
              style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#000', borderRadius: 12, cursor: 'pointer', color: '#9ca3af', fontSize: 14 },
            },
              React.createElement('div', { style: { fontSize: 32 } }, '▶'),
              React.createElement('div', null, 'Tap to play again'),
            )
          : shouldUseNativeVideo
          ? React.createElement('div', {
              ref: playerContainerRef,
              style: { position: 'relative', width: '100%', height: '100%', backgroundColor: '#000', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
            },
              React.createElement('video', {
                ref: videoRef,
                src: videoSrc,
                controls: true,
                controlsList: 'nodownload',
                playsInline: true,
                // IMPORTANT: Do NOT add CSS filter to <video> elements — causes black rendering in WebKit.
                style: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: '#000', outline: 'none', display: 'block', objectFit: 'contain' },
                preload: 'metadata',
              }),
              // X close button — top right of player, always reachable on mobile
              isPhone && React.createElement('button', {
                onClick: closePlayer,
                'aria-label': 'Close video',
                style: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, border: 'none', backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, lineHeight: 1 },
              }, '✕'),
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
                style: getDrivePreviewFrameStyle(),
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
