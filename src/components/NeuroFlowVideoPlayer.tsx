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
  /** Explicit download URL (e.g. Google Drive). If omitted, falls back to deriving from url. */
  downloadUrl?: string;
  accentColor?: string;
  title?: string;
  showOpenButton?: boolean;
};

// ── YouTube helpers ───────────────────────────────────────────────────────────
function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}

function getYouTubeVideoId(url: string): string | null {
  // handles youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID
  return (
    url.match(/youtu\.be\/([^?&#]+)/)?.[1] ??
    url.match(/[?&]v=([^&#]+)/)?.[1] ??
    url.match(/\/embed\/([^?&#]+)/)?.[1] ??
    null
  );
}

function getYouTubeEmbedUrl(url: string): string {
  const id = getYouTubeVideoId(url);
  if (!id) return url;
  // rel=0 hides related videos, modestbranding=1 reduces YouTube logo
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}

// ── Google Drive helpers ──────────────────────────────────────────────────────
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
  // Google Drive's direct download endpoint shows a virus-scan warning for
  // large public videos. Open the Drive file page instead so users get Drive's
  // native download flow without the scary error-looking interstitial.
  return id ? `https://drive.google.com/file/d/${id}/view?usp=sharing` : url;
}

function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

export default function NeuroFlowVideoPlayer({
  url,
  downloadUrl: explicitDownloadUrl,
  accentColor = '#FBBF24',
  title = 'Video Player',
  showOpenButton = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerContainerRef = useRef<any>(null);
  const { width } = useWindowDimensions();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(true); // toggled by X close button

  const isYouTube = isYouTubeUrl(url);
  const isDriveLink = url.includes('drive.google.com');
  const embedUrl = isYouTube
    ? getYouTubeEmbedUrl(url)
    : isDriveLink
    ? getGoogleDriveEmbedUrl(url)
    : url;
  // Use explicit download URL if provided (e.g. Google Drive link when player URL is YouTube).
  // Normalize Drive links so pasted share/direct links behave consistently.
  const downloadUrl = getVideoDownloadUrl(explicitDownloadUrl ?? url);
  // Native <video> only for direct mp4/mov/webm — YouTube and Drive use iframe
  const shouldUseNativeVideo = isDirectVideoUrl(url) && !isDriveLink && !isYouTube;
  const isPhone = width <= 480;

  // Mobile: full width, 16:9 height. Desktop: unchanged at 320px tall.
  const playerHeight = isPhone ? Math.round(Math.min(width, 560) * 9 / 16) : 320;

  // Stop ALL playback — works for both iframe (set src to about:blank) and native video.
  const stopPlayback = useCallback(() => {
    if (iframeRef.current) {
      try { iframeRef.current.src = 'about:blank'; } catch {}
    }
    if (videoRef.current) {
      try { videoRef.current.pause(); videoRef.current.currentTime = 0; } catch {}
    }
  }, []);

  // 1) STOP when the screen this player lives on loses focus (Expo Router navigation).
  useFocusEffect(
    useCallback(() => {
      return () => stopPlayback();
    }, [stopPlayback]),
  );

  // 2) STOP when the component unmounts (modal closes / page changes).
  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  // 3) STOP when the browser tab/page becomes hidden (user switches tab, locks phone, etc.).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.hidden) stopPlayback();
    };
    const onPageHide = () => stopPlayback();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [stopPlayback]);

  // Inject CSS to hide the browser's native fullscreen button (we provide our own).
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('nf-hide-video-fs-btn')) {
      const s = document.createElement('style');
      s.id = 'nf-hide-video-fs-btn';
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

  // X close button: stop playback and show "Tap to play again" placeholder.
  const closeAndStop = () => {
    stopPlayback();
    setIsLoaded(false);
  };

  // Replay placeholder click: reload the iframe/video.
  const reload = () => {
    setIsLoaded(true);
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

      <View style={[styles.frame, styles.videoFrame, { height: playerHeight, alignSelf: 'stretch' }]}>
        {!isLoaded
          ? React.createElement('div', {
              onClick: reload,
              style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#000', borderRadius: 12, cursor: 'pointer', color: '#9ca3af', fontSize: 14 },
            },
              React.createElement('div', { style: { fontSize: 36, color: accentColor } }, '▶'),
              React.createElement('div', null, 'Tap to play again'),
            )
          : shouldUseNativeVideo
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
                style: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: '#000', outline: 'none', display: 'block', objectFit: 'contain' },
                preload: 'metadata',
              }),
              React.createElement('button', {
                onClick: closeAndStop,
                'aria-label': 'Stop video',
                style: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, border: 'none', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, lineHeight: 1 },
              }, '✕'),
              React.createElement('button', {
                onClick: exitFullscreen,
                style: { display: isFullscreen ? 'flex' : 'none', position: 'absolute', top: 16, right: 56, zIndex: 9999, padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.5)', backgroundColor: 'rgba(248,113,113,0.12)', color: '#F87171', cursor: 'pointer', fontSize: 14, fontWeight: 700, alignItems: 'center', gap: 8 },
              }, '✕ Exit Full Screen'),
            )
          : React.createElement('div', {
              ref: playerContainerRef,
              style: { position: 'relative', width: '100%', height: '100%', backgroundColor: '#000', overflow: 'hidden', borderRadius: 12 },
            },
              React.createElement('iframe', {
                ref: iframeRef,
                src: embedUrl,
                frameBorder: 0,
                allow: 'autoplay; fullscreen',
                title,
                style: { width: '100%', height: '100%', border: 'none', backgroundColor: '#000' },
              }),
              React.createElement('button', {
                onClick: exitFullscreen,
                style: { display: isFullscreen ? 'flex' : 'none', position: 'absolute', top: 16, right: 56, zIndex: 9999, padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.5)', backgroundColor: 'rgba(248,113,113,0.12)', color: '#F87171', cursor: 'pointer', fontSize: 14, fontWeight: 700, alignItems: 'center', gap: 8 },
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
  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 24, borderRadius: radius.xl, marginTop: 8 },
  downloadIcon: { fontSize: 22 },
  downloadLabel: { fontSize: 16, fontWeight: '800', color: '#fff' },
  downloadSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  downloadBtnFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: radius.lg, marginTop: 2 },
  downloadBtnFullText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
