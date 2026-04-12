/**
 * NeuroFlow — Resource Viewer
 * Shared hidden page — accessible only via a resource card's action button.
 * ADHD-friendly: one card shown at a time, large tap targets, minimal clutter.
 * Slide deck downloads directly — no extra navigation.
 */

import React, { useEffect, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing } from '../../src/constants/theme';
import { fetchResourceCards, type ResourceCard } from '../../src/lib/adminDb';

const NF_BLUE = '#4A90E2';

// ─── Default cards fallback (mirrors resources.tsx) ──────────────────────────
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
function CardTab({
  card,
  isActive,
  onPress,
}: {
  card: ResourceCard;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tab,
        isActive && { backgroundColor: card.accent_color + '22', borderColor: card.accent_color },
      ]}
    >
      {card.icon_image_url
        ? <Image source={{ uri: card.icon_image_url }} style={{ width: 20, height: 20, borderRadius: 4 }} />
        : <Text style={{ fontSize: 16 }}>{card.icon}</Text>
      }
      {isActive && (
        <Text style={[styles.tabLabel, { color: card.accent_color }]} numberOfLines={1}>
          {card.title}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Inline PDF slide viewer (web only) ──────────────────────────────────────
// Renders the PDF in an iframe. Click anywhere on the viewer area to advance
// to the next page using PDF viewer's built-in fragment navigation.
function SlideViewer({ url, accentColor }: { url: string; accentColor: string }) {
  const [page, setPage] = useState(1);
  const { width } = useWindowDimensions();
  const viewerH = Math.min(width * 0.65, 520);

  // Build the URL with #page=N so the browser PDF viewer jumps to the right page
  const pageUrl = `${url}#page=${page}`;

  function nextPage() { setPage(p => p + 1); }
  function prevPage() { setPage(p => Math.max(1, p - 1)); }

  if (Platform.OS !== 'web') {
    // Native: no iframe — show download button only
    return (
      <Pressable onPress={() => Linking.openURL(url)}
        style={[styles.downloadBtn, { backgroundColor: accentColor }]}>
        <Text style={styles.downloadIcon}>📥</Text>
        <View>
          <Text style={styles.downloadLabel}>Open Slide Deck</Text>
          <Text style={styles.downloadSub}>Opens in your device viewer</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.slideViewerWrap}>
      {/* iframe rendered via dangerouslySetInnerHTML approach on web */}
      <View style={[styles.iframeContainer, { height: viewerH }]}>
        {/* @ts-ignore — iframe is valid on web */}
        <iframe
          src={pageUrl}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
          title="Slide Deck"
        />
        {/* Invisible click overlay — advances slide on tap */}
        <Pressable
          onPress={nextPage}
          style={styles.slideClickOverlay}
          accessibilityLabel="Tap to advance slide"
        />
      </View>

      {/* Slide nav controls */}
      <View style={styles.slideNav}>
        <Pressable
          onPress={prevPage}
          disabled={page === 1}
          style={[styles.slideNavBtn, { borderColor: accentColor, opacity: page === 1 ? 0.3 : 1 }]}
        >
          <Text style={[styles.slideNavText, { color: accentColor }]}>‹ Prev</Text>
        </Pressable>
        <Text style={styles.slidePageNum}>Slide {page}</Text>
        <Pressable
          onPress={nextPage}
          style={[styles.slideNavBtn, { borderColor: accentColor }]}
        >
          <Text style={[styles.slideNavText, { color: accentColor }]}>Next ›</Text>
        </Pressable>
      </View>

      {/* Download button — separate from viewer */}
      <Pressable onPress={() => Linking.openURL(url)} style={[styles.downloadBtnSmall, { borderColor: accentColor }]}>
        <Text style={{ fontSize: 14 }}>📥</Text>
        <Text style={[styles.downloadBtnSmallText, { color: accentColor }]}>Download PDF</Text>
      </Pressable>
    </View>
  );
}

// ─── Main card detail panel ───────────────────────────────────────────────────
function CardDetail({ card }: { card: ResourceCard }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
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
      {/* Hero icon + title row */}
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

      {/* Inline slide viewer OR coming-soon placeholder */}
      {card.slide_deck_url ? (
        <SlideViewer url={card.slide_deck_url} accentColor={card.accent_color} />
      ) : (
        <View style={styles.noDeckyBox}>
          <Text style={styles.noDeckText}>📭 Slide deck coming soon</Text>
          <Text style={styles.noDeckSub}>Check back — content will appear here.</Text>
        </View>
      )}

      {/* Secondary link */}
      {card.link && card.link !== '#' && (
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

  const [cards, setCards]       = useState<ResourceCard[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeId, setActiveId] = useState<string | null>(params.cardId ?? null);

  useEffect(() => {
    fetchResourceCards()
      .then(fetched => {
        const source = fetched.length > 0 ? fetched : DEFAULT_CARDS;
        setCards(source);
        // If no cardId in params, default to first card
        if (!activeId && source.length > 0) setActiveId(source[0].id);
      })
      .catch(() => {
        setCards(DEFAULT_CARDS);
        if (!activeId) setActiveId(DEFAULT_CARDS[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

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

            {/* Card tabs — horizontal scroll so all 6 are reachable */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              {cards.map(card => (
                <CardTab
                  key={card.id}
                  card={card}
                  isActive={card.id === activeId}
                  onPress={() => setActiveId(card.id)}
                />
              ))}
            </ScrollView>

            {/* Active card detail */}
            {activeCard && (
              <View style={[styles.detailCard, { borderColor: activeCard.accent_color + '44' }]}>
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

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(74,144,226,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  backBtnText:  { fontSize: 22, color: NF_BLUE, lineHeight: 28, fontWeight: '600' },
  pageTitle:    { fontSize: 22, fontWeight: '800', color: NF_BLUE, letterSpacing: -0.5 },
  pageSub:      { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  content: { gap: spacing.md },

  // Tabs
  tabsRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  tabLabel: { fontSize: 13, fontWeight: '700', maxWidth: 120 },

  // Detail card
  detailCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1.5, gap: spacing.md,
  },

  heroIconWrap: {
    width: 88, height: 88, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 4,
  },
  heroIcon: { fontSize: 48 },

  accentBar: { height: 3, borderRadius: 2, width: 48, alignSelf: 'center' },

  cardTitle: {
    fontSize: 24, fontWeight: '800', color: colors.textPrimary,
    textAlign: 'center', letterSpacing: -0.5, marginTop: 4,
  },
  cardDesc: {
    fontSize: 15, color: colors.textSecondary, lineHeight: 24,
    textAlign: 'center',
  },

  // Download CTA
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 18, paddingHorizontal: 24,
    borderRadius: radius.xl, marginTop: 8,
  },
  downloadIcon:  { fontSize: 28 },
  downloadLabel: { fontSize: 16, fontWeight: '800', color: '#fff' },
  downloadSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  noDeckyBox: {
    paddingVertical: 20, alignItems: 'center', gap: 6,
    backgroundColor: colors.bgBase, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  noDeckText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  noDeckSub:  { fontSize: 12, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 20 },

  // Secondary link
  linkBtn: {
    alignItems: 'center', paddingVertical: 14, borderRadius: radius.lg,
    borderWidth: 1.5, marginTop: 4,
  },
  linkBtnText: { fontSize: 14, fontWeight: '700' },

  // Slide viewer
  slideViewerWrap: { gap: 10, marginTop: 4 },
  iframeContainer: {
    width: '100%', borderRadius: 12, overflow: 'hidden',
    backgroundColor: '#1a1a2e', position: 'relative',
  },
  slideClickOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  slideNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  slideNavBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: radius.full, borderWidth: 1.5,
  },
  slideNavText: { fontSize: 14, fontWeight: '700' },
  slidePageNum: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  downloadBtnSmall: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderRadius: radius.lg, borderWidth: 1.5,
  },
  downloadBtnSmallText: { fontSize: 13, fontWeight: '700' },
});
