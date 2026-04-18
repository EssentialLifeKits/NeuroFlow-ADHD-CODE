/**
 * NeuroFlow — Resource Viewer
 * Shared hidden page — accessible only via a resource card's action button.
 * ADHD-friendly: one card shown at a time, large tap targets, minimal clutter.
 *
 * Content auto-detection:
 *   MP4/MOV/WebM URL  → VideoPlayer   (play + fullscreen + download)
 *   Comma-separated   → ImageSlideViewer (one slide at a time, arrows, click-to-advance)
 *   PDF/doc/other     → PDFSlideViewer  (PDF.js page-by-page) or SlideViewerFallback
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing } from '../../src/constants/theme';
import { fetchResourceCards, type ResourceCard } from '../../src/lib/adminDb';

const NF_BLUE = '#4A90E2';

// ─── Default cards fallback ───────────────────────────────────────────────────
const DEFAULT_CARDS: ResourceCard[] = [
  {
    id: 'default-1', sort_order: 0, is_active: true, created_at: '', updated_at: '',
    title: 'Deep Work Blueprint',
    description: 'Science-backed protocols for ADHD deep focus — no willpower required.',
    icon: '📘', icon_bg: NF_BLUE + '18', accent_color: NF_BLUE,
    link: '#', link_label: 'Download Free →',
    slide_deck_url: null, icon_image_url: null,
  },
  {
    id: 'default-2', sort_order: 1, is_active: true, created_at: '', updated_at: '',
    title: 'Focus Timer Templates',
    description: 'Pre-built Pomodoro + body-doubling schedules tuned for ADHD brains.',
    icon: '⏱', icon_bg: 'rgba(52,211,153,0.12)', accent_color: '#34D399',
    link: '#', link_label: 'Explore Templates →',
    slide_deck_url: null, icon_image_url: null,
  },
  {
    id: 'default-3', sort_order: 2, is_active: true, created_at: '', updated_at: '',
    title: 'Task Batching System',
    description: 'Group your tasks into energy-matched batches so decisions are eliminated.',
    icon: '📋', icon_bg: 'rgba(251,146,60,0.12)', accent_color: '#FB923C',
    link: '#', link_label: 'Get the System →',
    slide_deck_url: null, icon_image_url: null,
  },
  {
    id: 'default-4', sort_order: 3, is_active: true, created_at: '', updated_at: '',
    title: 'ADHD Habit Stacker',
    description: 'Anchor new routines to existing ones — build habits without constant reminders.',
    icon: '🔗', icon_bg: 'rgba(248,113,113,0.12)', accent_color: '#F87171',
    link: '#', link_label: 'Learn More →',
    slide_deck_url: null, icon_image_url: null,
  },
  {
    id: 'default-5', sort_order: 4, is_active: true, created_at: '', updated_at: '',
    title: 'Brain Dump Toolkit',
    description: 'Capture every thought, idea, and obligation into a trusted external system.',
    icon: '🧠', icon_bg: NF_BLUE + '14', accent_color: NF_BLUE,
    link: '#', link_label: 'Get Toolkit →',
    slide_deck_url: null, icon_image_url: null,
  },
  {
    id: 'default-6', sort_order: 5, is_active: true, created_at: '', updated_at: '',
    title: 'Productivity Analytics',
    description: 'Track focus streaks, energy patterns, and see your real daily output.',
    icon: '📊', icon_bg: 'rgba(96,165,250,0.12)', accent_color: '#60A5FA',
    link: '#', link_label: 'Track Progress →',
    slide_deck_url: null, icon_image_url: null,
  },
];

// ─── Card tab button ──────────────────────────────────────────────────────────
function CardTab({ card, isActive, onPress }: { card: ResourceCard; isActive: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, isActive && { backgroundColor: card.accent_color + '22', borderColor: card.accent_color }]}
    >
      {card.icon_image_url
        ? <Image source={{ uri: card.icon_image_url }} style={{ width: 20, height: 20, borderRadius: 4 }} />
        : <Text style={{ fontSize: 16 }}>{card.icon}</Text>
      }
      {isActive && (
        <Text style={[styles.tabLabel, { color: card.accent_color }]} numberOfLines={1}>{card.title}</Text>
      )}
    </Pressable>
  );
}

// ─── URL type detection ───────────────────────────────────────────────────────

/** Convert any Google Drive share/view link to a /preview embed URL */
function getGoogleDriveEmbedUrl(url: string): string {
  if (!url.includes('drive.google.com')) return url;
  if (url.includes('/preview')) return url; // already embed form
  const match = url.match(/\/file\/d\/([^/?#]+)/);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  return url;
}

/** True for direct video files OR Google Drive links (which stream via iframe) */
function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
      lower.includes('/video/') || lower.includes('videos/')) return true;
  // Google Drive links that point to video files — treat as embeddable video
  if (url.includes('drive.google.com')) return true;
  return false;
}


// ─── Load PDF.js from CDN (lazy, cached on window) ───────────────────────────
function loadPDFJS(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('not web')); return; }
    if ((window as any).__nfPdfjsLib) { resolve((window as any).__nfPdfjsLib); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (!lib) { reject(new Error('pdfjsLib not found after load')); return; }
      lib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      (window as any).__nfPdfjsLib = lib;
      resolve(lib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js from CDN'));
    document.head.appendChild(script);
  });
}

async function renderPDFPageToDataURL(pdfDoc: any, pageNum: number, scale = 1.6): Promise<string> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

// ─── PDF slide viewer (page-by-page via PDF.js CDN) ──────────────────────────
function PDFSlideViewer({ url, accentColor }: { url: string; accentColor: string }) {
  const [pageCount,    setPageCount]    = useState<number>(0);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [pageImgUrl,   setPageImgUrl]   = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [renderLoading, setRenderLoading] = useState(false);
  const [useFallback,  setUseFallback]  = useState(false);
  const [fullscreen,   setFullscreen]   = useState(false);
  const pdfDocRef = useRef<any>(null);
  const { width } = useWindowDimensions();
  const viewerH = Math.min(width * 0.65, 520);

  // Determine embed URL for fallback
  function getEmbedUrl(rawUrl: string): string {
    if (rawUrl.includes('drive.google.com') && rawUrl.includes('/preview')) return rawUrl;
    if (rawUrl.includes('drive.google.com/file/d/')) {
      const match = rawUrl.match(/\/file\/d\/([^/]+)/);
      if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return `https://docs.google.com/viewer?url=${encodeURIComponent(rawUrl)}&embedded=true`;
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Google Drive links → use fallback directly (can't fetch cross-origin)
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
      setUseFallback(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadPDFJS()
      .then(lib => lib.getDocument(url).promise)
      .then(async (doc: any) => {
        pdfDocRef.current = doc;
        setPageCount(doc.numPages);
        const imgUrl = await renderPDFPageToDataURL(doc, 1);
        setPageImgUrl(imgUrl);
        setLoading(false);
      })
      .catch(() => {
        setUseFallback(true);
        setLoading(false);
      });
  }, [url]);

  async function goToPage(pageNum: number) {
    if (!pdfDocRef.current || pageNum < 1 || pageNum > pageCount) return;
    setRenderLoading(true);
    try {
      const imgUrl = await renderPDFPageToDataURL(pdfDocRef.current, pageNum);
      setPageImgUrl(imgUrl);
      setCurrentPage(pageNum);
    } finally { setRenderLoading(false); }
  }

  function next() { goToPage(currentPage >= pageCount ? 1 : currentPage + 1); }
  function prev() { goToPage(currentPage <= 1 ? pageCount : currentPage - 1); }

  // Mobile fallback
  if (Platform.OS !== 'web') {
    return (
      <Pressable onPress={() => Linking.openURL(url)} style={[styles.downloadBtn, { backgroundColor: accentColor }]}>
        <Text style={styles.downloadIcon}>📄</Text>
        <View>
          <Text style={styles.downloadLabel}>Open Document</Text>
          <Text style={styles.downloadSub}>Opens in your device viewer</Text>
        </View>
      </Pressable>
    );
  }

  // Google Drive / unsupported → iframe fallback
  if (useFallback) {
    const embedUrl = getEmbedUrl(url);
    return (
      <View style={styles.slideViewerWrap}>
        <View style={styles.slideToolbar}>
          <Text style={styles.slideToolbarLabel}>Use ‹ › inside the viewer to navigate slides</Text>
          <Pressable onPress={() => setFullscreen(true)} style={[styles.slideToolbarBtn, { borderColor: accentColor }]}>
            <Text style={[styles.slideToolbarBtnText, { color: accentColor }]}>⛶ Full Screen</Text>
          </Pressable>
        </View>
        <View style={[styles.iframeContainer, { height: viewerH }]}>
          {/* @ts-ignore */}
          <iframe src={embedUrl} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }} title="Document" allow="autoplay" />
          {/* Block Google's native "open in new tab" button (bottom-right corner) */}
          {React.createElement('div', {
            style: {
              position: 'absolute', bottom: 0, right: 0,
              width: 56, height: 56,
              backgroundColor: '#0b1426',
              borderBottomRightRadius: 12,
              pointerEvents: 'auto',
              cursor: 'default',
            },
          })}
        </View>
        <Pressable onPress={() => Linking.openURL(url)} style={[styles.downloadBtnFull, { backgroundColor: accentColor }]}>
          <Text style={{ fontSize: 16 }}>📥</Text>
          <Text style={styles.downloadBtnFullText}>Download Document</Text>
        </Pressable>
        {fullscreen && Platform.OS === 'web' && React.createElement('div', {
          style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.97)', display: 'flex', flexDirection: 'column' },
        }, [
          React.createElement('div', { key: 'bar', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(74,144,226,0.2)', backgroundColor: '#0b1426' } }, [
            React.createElement('span', { key: 't', style: { fontSize: 15, fontWeight: 700, color: '#fff' } }, 'Document — Full Screen'),
            React.createElement('div', { key: 'btns', style: { display: 'flex', gap: 10 } }, [
              React.createElement('a', { key: 'dl', href: url, download: true, style: { padding: '6px 16px', borderRadius: 8, border: `1px solid ${accentColor}`, color: accentColor, cursor: 'pointer', fontSize: 13, fontWeight: 700, textDecoration: 'none' } }, '📥 Download'),
              React.createElement('button', { key: 'x', onClick: () => setFullscreen(false), style: { padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.4)', backgroundColor: 'rgba(248,113,113,0.08)', color: '#F87171', cursor: 'pointer', fontSize: 13, fontWeight: 700 } }, '✕ Close'),
            ]),
          ]),
          React.createElement('iframe', { key: 'fi', src: embedUrl, style: { flex: 1, width: '100%', border: 'none', backgroundColor: '#000' }, title: 'Document Fullscreen', allow: 'autoplay' }),
        ])}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.iframeContainer, { height: viewerH, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={accentColor} size="large" />
        <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 10 }}>Loading document…</Text>
      </View>
    );
  }

  // PDF.js page-by-page renderer
  return (
    <View style={styles.slideViewerWrap}>
      {/* Toolbar */}
      <View style={styles.slideToolbar}>
        <Text style={styles.slideToolbarLabel}>
          {pageCount > 0 ? `Page ${currentPage} of ${pageCount} · tap slide or use arrows` : 'Document'}
        </Text>
        <Pressable onPress={() => setFullscreen(true)} style={[styles.slideToolbarBtn, { borderColor: accentColor }]}>
          <Text style={[styles.slideToolbarBtnText, { color: accentColor }]}>⛶ Full Screen</Text>
        </Pressable>
      </View>

      {/* Page image — click to advance */}
      <View style={[styles.iframeContainer, { height: viewerH }]}>
        {React.createElement('div', {
          onClick: next,
          style: { width: '100%', height: '100%', position: 'relative', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1426' },
        },
          renderLoading
            ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 } }, [
                React.createElement('div', { key: 'spin', style: { width: 36, height: 36, border: `3px solid ${accentColor}33`, borderTopColor: accentColor, borderRadius: '50%', animation: 'spin 0.8s linear infinite' } }),
              ])
            : pageImgUrl
              ? React.createElement('img', { src: pageImgUrl, style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 10, display: 'block' }, draggable: false })
              : React.createElement('span', { style: { color: '#666', fontSize: 14 } }, 'No page rendered')
        )}
      </View>

      {/* Arrow navigation */}
      {pageCount > 1 && (
        <View style={styles.slideArrowRow}>
          <Pressable onPress={prev} style={[styles.slideArrowBtn, { borderColor: accentColor }]}>
            <Text style={[styles.slideArrowText, { color: accentColor }]}>‹</Text>
          </Pressable>
          <View style={styles.slideDots}>
            {Array.from({ length: Math.min(pageCount, 12) }).map((_, i) => {
              const pg = Math.floor((i / Math.min(pageCount, 12)) * pageCount) + 1;
              return (
                <Pressable key={i} onPress={() => goToPage(pg)}>
                  <View style={[styles.slideDot, { backgroundColor: pg === currentPage ? accentColor : accentColor + '33' }]} />
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={next} style={[styles.slideArrowBtn, { borderColor: accentColor }]}>
            <Text style={[styles.slideArrowText, { color: accentColor }]}>›</Text>
          </Pressable>
        </View>
      )}

      {/* Single download button */}
      <Pressable onPress={() => Linking.openURL(url)} style={[styles.downloadBtnFull, { backgroundColor: accentColor }]}>
        <Text style={{ fontSize: 16 }}>📥</Text>
        <Text style={styles.downloadBtnFullText}>Download Document</Text>
      </Pressable>

      {/* Fullscreen modal */}
      {fullscreen && Platform.OS === 'web' && React.createElement('div', {
        style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.97)', display: 'flex', flexDirection: 'column' },
      }, [
        React.createElement('div', { key: 'bar', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(74,144,226,0.2)', backgroundColor: '#0b1426', flexShrink: 0 } }, [
          React.createElement('span', { key: 't', style: { fontSize: 15, fontWeight: 700, color: '#fff' } }, `Page ${currentPage} of ${pageCount}`),
          React.createElement('div', { key: 'btns', style: { display: 'flex', gap: 10 } }, [
            React.createElement('a', { key: 'dl', href: url, download: true, style: { padding: '6px 16px', borderRadius: 8, border: `1px solid ${accentColor}`, color: accentColor, cursor: 'pointer', fontSize: 13, fontWeight: 700, textDecoration: 'none' } }, '📥 Download'),
            React.createElement('button', { key: 'x', onClick: () => setFullscreen(false), style: { padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.4)', backgroundColor: 'rgba(248,113,113,0.08)', color: '#F87171', cursor: 'pointer', fontSize: 13, fontWeight: 700 } }, '✕ Close'),
          ]),
        ]),
        React.createElement('div', { key: 'img', onClick: next, style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '20px 80px', backgroundColor: '#000' } },
          pageImgUrl
            ? React.createElement('img', { src: pageImgUrl, style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }, draggable: false })
            : null
        ),
        pageCount > 1 && React.createElement('div', { key: 'nav', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '16px 20px', backgroundColor: '#0b1426', flexShrink: 0 } }, [
          React.createElement('button', { key: 'p', onClick: (e: any) => { e.stopPropagation(); prev(); }, style: { width: 44, height: 44, borderRadius: 22, border: `2px solid ${accentColor}`, backgroundColor: 'transparent', color: accentColor, cursor: 'pointer', fontSize: 22, fontWeight: 700 } }, '‹'),
          React.createElement('span', { key: 'n', style: { color: '#fff', fontSize: 14, fontWeight: 600, minWidth: 80, textAlign: 'center' } }, `${currentPage} / ${pageCount}`),
          React.createElement('button', { key: 'nx', onClick: (e: any) => { e.stopPropagation(); next(); }, style: { width: 44, height: 44, borderRadius: 22, border: `2px solid ${accentColor}`, backgroundColor: 'transparent', color: accentColor, cursor: 'pointer', fontSize: 22, fontWeight: 700 } }, '›'),
        ]),
      ])}
    </View>
  );
}

// ─── Horizontal image slide viewer ───────────────────────────────────────────
// One image per screen. Click anywhere or arrows to advance. Auto-resets at end.
function ImageSlideViewer({ urls, accentColor }: { urls: string[]; accentColor: string }) {
  const [index,      setIndex]      = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const { width } = useWindowDimensions();
  const viewerH = Math.min(width * 0.62, 500);

  function next() { setIndex(i => (i + 1 >= urls.length ? 0 : i + 1)); }
  function prev() { setIndex(i => (i - 1 < 0 ? urls.length - 1 : i - 1)); }

  // Mobile: horizontal scroll with paging, one image = full width
  if (Platform.OS !== 'web') {
    return (
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ width, height: 260 }}
          contentContainerStyle={{ width: width * urls.length }}
        >
          {urls.map((u, i) => (
            <Image key={i} source={{ uri: u }} style={{ width, height: 260, resizeMode: 'contain' }} />
          ))}
        </ScrollView>
        {/* Arrow row on mobile */}
        <View style={[styles.slideArrowRow, { marginTop: 8 }]}>
          <Pressable onPress={prev} style={[styles.slideArrowBtn, { borderColor: accentColor }]}>
            <Text style={[styles.slideArrowText, { color: accentColor }]}>‹</Text>
          </Pressable>
          <View style={styles.slideDots}>
            {urls.map((_, i) => (
              <View key={i} style={[styles.slideDot, { backgroundColor: i === index ? accentColor : accentColor + '33' }]} />
            ))}
          </View>
          <Pressable onPress={next} style={[styles.slideArrowBtn, { borderColor: accentColor }]}>
            <Text style={[styles.slideArrowText, { color: accentColor }]}>›</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => Linking.openURL(urls[index])} style={[styles.downloadBtnFull, { backgroundColor: accentColor, marginTop: 8 }]}>
          <Text style={{ fontSize: 16 }}>📥</Text>
          <Text style={styles.downloadBtnFullText}>Download Slide</Text>
        </Pressable>
      </View>
    );
  }

  // Web: one image at a time, click to advance
  return (
    <View style={styles.slideViewerWrap}>
      {/* Toolbar */}
      <View style={styles.slideToolbar}>
        <Text style={styles.slideToolbarLabel}>
          Slide {index + 1} of {urls.length} · tap slide or use arrows
        </Text>
        <Pressable onPress={() => setFullscreen(true)} style={[styles.slideToolbarBtn, { borderColor: accentColor }]}>
          <Text style={[styles.slideToolbarBtnText, { color: accentColor }]}>⛶ Full Screen</Text>
        </Pressable>
      </View>

      {/* Single slide — click anywhere to advance */}
      <View style={[styles.iframeContainer, { height: viewerH }]}>
        {React.createElement('div', {
          onClick: next,
          style: { width: '100%', height: '100%', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1426', borderRadius: 12 },
        },
          React.createElement('img', {
            src: urls[index],
            style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 10, display: 'block' },
            draggable: false,
          })
        )}
      </View>

      {/* Arrow navigation */}
      <View style={styles.slideArrowRow}>
        <Pressable onPress={prev} style={[styles.slideArrowBtn, { borderColor: accentColor }]}>
          <Text style={[styles.slideArrowText, { color: accentColor }]}>‹</Text>
        </Pressable>
        <View style={styles.slideDots}>
          {urls.map((_, i) => (
            <Pressable key={i} onPress={() => setIndex(i)}>
              <View style={[styles.slideDot, { backgroundColor: i === index ? accentColor : accentColor + '33' }]} />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={next} style={[styles.slideArrowBtn, { borderColor: accentColor }]}>
          <Text style={[styles.slideArrowText, { color: accentColor }]}>›</Text>
        </Pressable>
      </View>

      {/* Single download button */}
      <Pressable onPress={() => Linking.openURL(urls[index])} style={[styles.downloadBtnFull, { backgroundColor: accentColor }]}>
        <Text style={{ fontSize: 16 }}>📥</Text>
        <Text style={styles.downloadBtnFullText}>Download Slide</Text>
      </Pressable>

      {/* Fullscreen modal */}
      {fullscreen && Platform.OS === 'web' && React.createElement('div', {
        style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.97)', display: 'flex', flexDirection: 'column' },
      }, [
        React.createElement('div', { key: 'bar', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(74,144,226,0.2)', backgroundColor: '#0b1426', flexShrink: 0 } }, [
          React.createElement('span', { key: 't', style: { fontSize: 15, fontWeight: 700, color: '#fff' } }, `Slide ${index + 1} of ${urls.length}`),
          React.createElement('div', { key: 'btns', style: { display: 'flex', gap: 10 } }, [
            React.createElement('a', { key: 'dl', href: urls[index], download: true, style: { padding: '6px 16px', borderRadius: 8, border: `1px solid ${accentColor}`, color: accentColor, cursor: 'pointer', fontSize: 13, fontWeight: 700, textDecoration: 'none' } }, '📥 Download'),
            React.createElement('button', { key: 'x', onClick: () => setFullscreen(false), style: { padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.4)', backgroundColor: 'rgba(248,113,113,0.08)', color: '#F87171', cursor: 'pointer', fontSize: 13, fontWeight: 700 } }, '✕ Close'),
          ]),
        ]),
        React.createElement('div', { key: 'img', onClick: next, style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '20px 80px', backgroundColor: '#000' } },
          React.createElement('img', { src: urls[index], style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }, draggable: false })
        ),
        React.createElement('div', { key: 'nav', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '16px 20px', backgroundColor: '#0b1426', flexShrink: 0 } }, [
          React.createElement('button', { key: 'p', onClick: (e: any) => { e.stopPropagation(); prev(); }, style: { width: 44, height: 44, borderRadius: 22, border: `2px solid ${accentColor}`, backgroundColor: 'transparent', color: accentColor, cursor: 'pointer', fontSize: 22, fontWeight: 700 } }, '‹'),
          React.createElement('span', { key: 'n', style: { color: '#fff', fontSize: 14, fontWeight: 600, minWidth: 80, textAlign: 'center' } }, `${index + 1} / ${urls.length}`),
          React.createElement('button', { key: 'nx', onClick: (e: any) => { e.stopPropagation(); next(); }, style: { width: 44, height: 44, borderRadius: 22, border: `2px solid ${accentColor}`, backgroundColor: 'transparent', color: accentColor, cursor: 'pointer', fontSize: 22, fontWeight: 700 } }, '›'),
        ]),
      ])}
    </View>
  );
}

// ─── MP4/MOV/Google Drive video player ────────────────────────────────────────
// ⛶ calls requestFullscreen() on the actual element — TRUE OS fullscreen.
function VideoPlayer({ url, accentColor }: { url: string; accentColor: string }) {
  const videoRef = useRef<any>(null);
  const driveContainerRef = useRef<any>(null);
  const isDriveLink = url.includes('drive.google.com');
  const embedUrl = isDriveLink ? getGoogleDriveEmbedUrl(url) : url;

  // Pause inline video when navigating away
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (videoRef.current) videoRef.current.pause();
      };
    }, [])
  );

  // TRUE OS fullscreen — takes over the entire screen, outside browser chrome
  const openFullscreen = () => {
    const el = isDriveLink ? driveContainerRef.current : videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
  };

  if (Platform.OS !== 'web') {
    return (
      <Pressable onPress={() => Linking.openURL(url)} style={[styles.downloadBtn, { backgroundColor: accentColor }]}>
        <Text style={styles.downloadIcon}>▶️</Text>
        <View>
          <Text style={styles.downloadLabel}>Play Video</Text>
          <Text style={styles.downloadSub}>Opens in your device player</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.slideViewerWrap}>
      {/* Toolbar */}
      <View style={styles.slideToolbar}>
        <Text style={styles.slideToolbarLabel}>▶ Video Player</Text>
        <Pressable onPress={openFullscreen} style={[styles.slideToolbarBtn, { borderColor: accentColor }]}>
          <Text style={[styles.slideToolbarBtnText, { color: accentColor }]}>⛶ Full Screen</Text>
        </Pressable>
      </View>

      {/* Inline player */}
      <View style={[styles.iframeContainer, { height: 320 }]}>
        {isDriveLink
          ? React.createElement('div', {
              ref: driveContainerRef,
              style: { position: 'relative', width: '100%', height: '100%' },
            },
              React.createElement('iframe', {
                src: embedUrl, frameBorder: 0,
                allow: 'autoplay; fullscreen',
                style: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: '#000', border: 'none' },
              }),
              React.createElement('div', {
                style: { position: 'absolute', bottom: 0, right: 0, width: 56, height: 56, zIndex: 10, cursor: 'default' },
                onClick: (e: any) => e.stopPropagation(),
              })
            )
          : React.createElement('video', {
              ref: videoRef,
              src: url, controls: true,
              controlsList: 'nodownload',
              style: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: '#000', outline: 'none', display: 'block' },
              preload: 'metadata',
            })
        }
      </View>

      {/* Download / Open button */}
      <Pressable onPress={() => Linking.openURL(url)} style={[styles.downloadBtnFull, { backgroundColor: accentColor }]}>
        <Text style={{ fontSize: 16 }}>📥</Text>
        <Text style={styles.downloadBtnFullText}>{isDriveLink ? 'Open in Google Drive' : 'Download Video'}</Text>
      </Pressable>
    </View>
  );
}

// ─── Main card detail panel ───────────────────────────────────────────────────
function CardDetail({ card }: { card: ResourceCard }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(16);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [card.id]);

  async function handleLink() {
    if (!card.link || card.link === '#') return;
    try { await Linking.openURL(card.link); } catch {}
  }

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }, { gap: 14 }]}>
      {/* Hero icon + title */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={[styles.heroIconWrap, { backgroundColor: card.icon_bg }]}>
          {card.icon_image_url
            ? <Image source={{ uri: card.icon_image_url }} style={{ width: 48, height: 48, borderRadius: 12 }} />
            : <Text style={styles.heroIcon}>{card.icon}</Text>
          }
        </View>
        <View style={{ flex: 1 }}>
          <View style={[styles.accentBar, { backgroundColor: card.accent_color, alignSelf: 'flex-start', marginBottom: 4 }]} />
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardDesc}>{card.description}</Text>
        </View>
      </View>

      {/* Auto-detect viewer */}
      {card.slide_deck_url ? (
        isVideoUrl(card.slide_deck_url) ? (
          <VideoPlayer url={card.slide_deck_url} accentColor={card.accent_color} />
        ) : card.slide_deck_url.includes(',') ? (
          <ImageSlideViewer
            urls={card.slide_deck_url.split(',').map(u => u.trim()).filter(Boolean)}
            accentColor={card.accent_color}
          />
        ) : (
          <PDFSlideViewer url={card.slide_deck_url} accentColor={card.accent_color} />
        )
      ) : (
        <View style={styles.noDeckyBox}>
          <Text style={styles.noDeckText}>📭 Content coming soon</Text>
          <Text style={styles.noDeckSub}>Check back — content will appear here.</Text>
        </View>
      )}

      {/* Secondary link — only shown when there is no slide/video content
          (avoids duplicating the download button already in the viewer) */}
      {card.link && card.link !== '#' && !card.slide_deck_url && (
        <Pressable onPress={handleLink} style={[styles.linkBtn, { borderColor: card.accent_color }]}>
          <Text style={[styles.linkBtnText, { color: card.accent_color }]}>{card.link_label}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─── Resource Viewer Screen ───────────────────────────────────────────────────
export default function ResourceViewerScreen() {
  const router  = useRouter();
  const params  = useLocalSearchParams<{ cardId?: string }>();
  const { width } = useWindowDimensions();

  const [cards,      setCards]      = useState<ResourceCard[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [activeId,   setActiveId]   = useState<string | null>(params.cardId ?? null);
  // Bumped on every card switch to guarantee full DOM teardown of iframe/video
  const [contentKey, setContentKey] = useState(0);

  // When the URL param changes (user navigated back and tapped a different card),
  // reset activeId and contentKey so fresh content always renders
  useEffect(() => {
    if (params.cardId && params.cardId !== activeId) {
      setActiveId(params.cardId);
      setContentKey(k => k + 1);
    }
  }, [params.cardId]);

  useEffect(() => {
    fetchResourceCards()
      .then(fetched => {
        const source = fetched.length > 0 ? fetched : DEFAULT_CARDS;
        setCards(source);
        if (!activeId && source.length > 0) {
          setActiveId(source[0].id);
          setContentKey(k => k + 1);
        }
      })
      .catch(() => {
        setCards(DEFAULT_CARDS);
        if (!activeId) {
          setActiveId(DEFAULT_CARDS[0].id);
          setContentKey(k => k + 1);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function switchCard(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setContentKey(k => k + 1); // force React to fully unmount old iframe/video
  }

  const activeCard = cards.find(c => c.id === activeId) ?? cards[0] ?? null;
  const isDesktop  = width > 768;
  const maxW       = isDesktop ? 640 : undefined;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/(app)/resources')} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Resources</Text>
            <Text style={styles.pageSub}>Your ADHD toolkit — tap a card below</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={NF_BLUE} style={{ marginTop: 48 }} />
        ) : (
          <View style={[styles.content, maxW ? { maxWidth: maxW, alignSelf: 'center', width: '100%' } : undefined]}>

            {/* Card tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
              {cards.map(card => (
                <CardTab
                  key={card.id}
                  card={card}
                  isActive={card.id === activeId}
                  onPress={() => switchCard(card.id)}
                />
              ))}
            </ScrollView>

            {/* key={contentKey} guarantees React tears down the entire subtree
                (including any iframe/video DOM nodes) on every card switch */}
            {activeCard && (
              <View key={contentKey} style={[styles.detailCard, { borderColor: activeCard.accent_color + '44' }]}>
                <CardDetail card={activeCard} />
              </View>
            )}

          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bgBase },
  scroll: { padding: spacing.lg, gap: spacing.lg },

  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  backBtn:     { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(74,144,226,0.12)', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 22, color: NF_BLUE, lineHeight: 28, fontWeight: '600' },
  pageTitle:   { fontSize: 22, fontWeight: '800', color: NF_BLUE, letterSpacing: -0.5 },
  pageSub:     { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  content: { gap: spacing.md },

  tabsRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  tabLabel: { fontSize: 13, fontWeight: '700', maxWidth: 120 },

  detailCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1.5, gap: spacing.md,
  },

  heroIconWrap: { width: 88, height: 88, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 4 },
  heroIcon:     { fontSize: 48 },

  accentBar: { height: 3, borderRadius: 2, width: 48, alignSelf: 'center' },

  cardTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.5, marginTop: 4 },
  cardDesc:  { fontSize: 15, color: colors.textSecondary, lineHeight: 24, textAlign: 'center' },

  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 24, borderRadius: radius.xl, marginTop: 8 },
  downloadIcon:  { fontSize: 28 },
  downloadLabel: { fontSize: 16, fontWeight: '800', color: '#fff' },
  downloadSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  noDeckyBox: { paddingVertical: 20, alignItems: 'center', gap: 6, backgroundColor: colors.bgBase, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  noDeckText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  noDeckSub:  { fontSize: 12, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 20 },

  linkBtn:     { alignItems: 'center', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1.5, marginTop: 4 },
  linkBtnText: { fontSize: 14, fontWeight: '700' },

  slideViewerWrap: { gap: 10, marginTop: 4 },
  iframeContainer: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1a2e', position: 'relative' },

  slideToolbar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  slideToolbarLabel:   { fontSize: 11, color: colors.textTertiary, flex: 1 },
  slideToolbarBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1.5 },
  slideToolbarBtnText: { fontSize: 12, fontWeight: '700' },

  downloadBtnFull:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: radius.lg, marginTop: 2 },
  downloadBtnFullText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  slideArrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 4 },
  slideArrowBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  slideArrowText: { fontSize: 26, fontWeight: '700', lineHeight: 30 },
  slideDots: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: 1, justifyContent: 'center' },
  slideDot:  { width: 8, height: 8, borderRadius: 4 },
});
