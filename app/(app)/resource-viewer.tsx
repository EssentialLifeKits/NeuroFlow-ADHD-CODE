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
import { colors, radius, spacing, typography } from '../../src/constants/theme';
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

  async function handleDownload() {
    if (!card.slide_deck_url) return;
    try {
      await Linking.openURL(card.slide_deck_url);
    } catch {}
  }

  async function handleLink() {
    if (!card.link || card.link === '#') return;
    try { await Linking.openURL(card.link); } catch {}
  }

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Hero icon */}
      <View style={[styles.heroIconWrap, { backgroundColor: card.icon_bg }]}>
        {card.icon_image_url
          ? <Image source={{ uri: card.icon_image_url }} style={{ width: 64, height: 64, borderRadius: 16 }} />
          : <Text style={styles.heroIcon}>{card.icon}</Text>
        }
      </View>

      {/* Accent bar */}
      <View style={[styles.accentBar, { backgroundColor: card.accent_color }]} />

      {/* Title + description */}
      <Text style={styles.cardTitle}>{card.title}</Text>
      <Text style={styles.cardDesc}>{card.description}</Text>

      {/* Slide deck download — primary CTA */}
      {card.slide_deck_url ? (
        <Pressable onPress={handleDownload} style={[styles.downloadBtn, { backgroundColor: card.accent_color }]}>
          <Text style={styles.downloadIcon}>📥</Text>
          <View>
            <Text style={styles.downloadLabel}>Download Slide Deck</Text>
            <Text style={styles.downloadSub}>Tap to open or save PDF</Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.noDeckyBox}>
          <Text style={styles.noDeckText}>📭 Slide deck coming soon</Text>
          <Text style={styles.noDeckSub}>Check back — the admin will upload resources here.</Text>
        </View>
      )}

      {/* Secondary link (if set) */}
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
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
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
});
