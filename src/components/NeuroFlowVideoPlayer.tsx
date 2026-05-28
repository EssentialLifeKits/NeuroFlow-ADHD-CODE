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
  // enablejsapi=1 lets us send postMessage pause commands without destroying the iframe.
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&controls=1&fs=1&playsinline=1&enablejsapi=1`;
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

  // 3) PAUSE/STOP when the browser tab/page becomes hidden.
  // For YouTube iframes we send a postMessage pause instead of blanking src —
  // this way returning to the app shows the paused player rather than a blank screen.
  // pagehide still fully stops (page is being unloaded anyway).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisibility = () => {
      if (!document.hidden) return;
      // Gentle pause for YouTube so the player survives tab/app switching.
      if (iframeRef.current?.contentWindow && isYouTube) {
        try {
          iframeRef.current.contentWindow.postMessage(
            '{"event":"command","func":"pauseVideo","args":""}',
            'https://www.youtube.com',
          );
        } catch {}
      } else {
        stopPlayback();
      }
    };
    const onPageHide = () => stopPlayback();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [stopPlayback, isYouTube]);

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

  // Open a YouTube URL in the YouTube app without navigating the current browser
  // tab — works in both Safari and Chrome on iOS.
  //
  // The trick: fire the youtube:// scheme from a HIDDEN IFRAME, not from the
  // main page. The iframe navigation never changes the main page's URL or
  // unloads its JavaScript, so the app and session stay fully intact.
  // iOS intercepts the custom scheme at the OS level (WKWebView underneath
  // every iOS browser) and opens the YouTube app regardless of whether the
  // navigation originated from the main frame or an iframe.
  //
  // Fallback: if the YouTube app is not installed, the iframe navigation fails
  // silently and document never becomes hidden. After 1 s we open the https
  // web URL in a new tab instead (app tab still untouched).
  //
  // All other URLs (Drive, etc.) → window.open(_blank), new tab only.
  // Native → Linking.openURL, correct on iOS/Android native.
  const openExternal = (externalUrl: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (isYouTubeUrl(externalUrl)) {
        const id = getYouTubeVideoId(externalUrl);
        if (id) {
          let appOpened = false;
          const onVisibility = () => { if (document.hidden) appOpened = true; };
          document.addEventListener('visibilitychange', onVisibility);

          // Hidden off-screen iframe — triggers the scheme without touching
          // the main page URL in Safari or Chrome.
          const iframe = document.createElement('iframe');
          iframe.style.cssText =
            'position:absolute;width:1px;height:1px;top:-9999px;left:-9999px;border:none;opacity:0;';
          iframe.src = `youtube://watch?v=${id}`;
          document.body.appendChild(iframe);

          setTimeout(() => {
            document.removeEventListener('visibilitychange', onVisibility);
            try { document.body.removeChild(iframe); } catch {}
            if (!appOpened) {
              // YouTube app not installed — open web URL in a new tab.
              window.open(
                `https://www.youtube.com/watch?v=${id}`,
                '_blank',
                'noopener,noreferrer',
              );
            }
          }, 1000);
          return;
        }
      }
      // Non-YouTube (Drive, etc.) — new tab, app tab stays untouched.
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(externalUrl);
    }
  };

  const openFullscreen = () => {
    // iOS does not support requestFullscreen() on divs or cross-origin iframes.
    // On mobile with a YouTube video, open the YouTube app/site instead —
    // that gives real fullscreen with all native controls.
    // Use openExternal so the current tab is never navigated away.
    if (isPhone && isYouTube) {
      const id = getYouTubeVideoId(url);
      const watchUrl = id ? `https://www.youtube.com/watch?v=${id}` : url;
      openExternal(watchUrl);
      return;
    }
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
      <Pressable onPress={() => openExternal(downloadUrl)} style={[styles.downloadBtn, { backgroundColor: accentColor }]}>
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
                allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen',
                allowFullScreen: true,
                // sandbox blocks the iframe from navigating the parent browser tab.
                // Without this, YouTube's "Watch on YouTube" button navigates the parent
                // to youtube.com, iOS intercepts it to open the YouTube app, and the
                // browser tab is left at about:blank with no way back.
                // allow-popups lets YouTube open share/subscribe flows in a new tab.
                // allow-popups-to-escape-sandbox ensures those popups work normally.
                // allow-presentation enables the Fullscreen API inside the iframe.
                // Omitting allow-top-navigation / allow-top-navigation-by-user-activation
                // is what prevents the parent-tab hijack.
                sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms',
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
        <Pressable onPress={() => openExternal(downloadUrl)} style={[styles.downloadBtnFull, { backgroundColor: accentColor }]}>
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
