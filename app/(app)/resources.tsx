/**
 * NeuroFlow — Resources Page
 *
 * Fix #7: Strip remaining Instagram colors.
 * All gradients and highlights match NeuroFlow Blue theme (#4A90E2).
 * Resources updated to ADHD-relevant tools instead of Instagram content.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '../../src/constants/theme';
import { fetchResourceCards } from '../../src/lib/adminDb';
import { supabase } from '../../src/lib/supabase';

const NF_BLUE = '#4A90E2';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function PulsingDot() {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opac  = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.5, duration: 1400, useNativeDriver: true }),
          Animated.timing(opac,  { toValue: 1,   duration: 1400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.7, duration: 1400, useNativeDriver: true }),
          Animated.timing(opac,  { toValue: 0.5, duration: 1400, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={{
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: '#34D399', // Using green like the example
      transform: [{ scale }],
      opacity: opac,
      shadowColor: '#34D399', shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9, shadowRadius: 4, elevation: 4,
    }} />
  );
}

// ─── Resource type ────────────────────────────────────────────────────────────
interface Resource {
  id: string;
  title: string;
  description: string;
  icon: string;
  iconBg: string;
  link: string;
  linkLabel: string;
  accent: string;
}

// Default cards — always shown immediately; DB data overlays on top when it loads
const DEFAULT_RESOURCES: Resource[] = [
  {
    id: 'default-1',
    title: 'Deep Work Blueprint',
    description: 'Science-backed protocols for ADHD deep focus — no willpower required.',
    icon: '📘', iconBg: NF_BLUE + '18', link: '#', linkLabel: 'Open Resource →', accent: NF_BLUE,
  },
  {
    id: 'default-2',
    title: 'Focus Timer Templates',
    description: 'Pre-built Pomodoro + body-doubling schedules tuned for ADHD brains.',
    icon: '⏱', iconBg: 'rgba(52, 211, 153, 0.12)', link: '#', linkLabel: 'Open Resource →', accent: '#34D399',
  },
  {
    id: 'default-3',
    title: 'Task Batching System',
    description: 'Group your tasks into energy-matched batches so decisions are eliminated.',
    icon: '📋', iconBg: 'rgba(251, 146, 60, 0.12)', link: '#', linkLabel: 'Open Resource →', accent: '#FB923C',
  },
  {
    id: 'default-4',
    title: 'ADHD Habit Stacker',
    description: 'Anchor new routines to existing ones — build habits without constant reminders.',
    icon: '🔗', iconBg: 'rgba(248, 113, 113, 0.12)', link: '#', linkLabel: 'Open Resource →', accent: '#F87171',
  },
  {
    id: 'default-5',
    title: 'Brain Dump Toolkit',
    description: 'Capture every thought, idea, and obligation into a trusted external system.',
    icon: '🧠', iconBg: NF_BLUE + '14', link: '#', linkLabel: 'Open Resource →', accent: NF_BLUE,
  },
  {
    id: 'default-6',
    title: 'Productivity Analytics',
    description: 'Track focus streaks, energy patterns, and see your real daily output.',
    icon: '📊', iconBg: 'rgba(96, 165, 250, 0.12)', link: '#', linkLabel: 'Open Resource →', accent: '#60A5FA',
  },
];

// ─── Resource Card ────────────────────────────────────────────────────────────
function ResourceCard({ resource, delay, cardWidth, onPress }: { resource: Resource; delay: number; cardWidth: any; onPress: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const hoverAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  const borderColor = hoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, NF_BLUE],
  });

  const shadowOpacity = hoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }], width: cardWidth as any }]}>
      <Pressable
        onHoverIn={() => Animated.timing(hoverAnim, { toValue: 1, duration: 250, useNativeDriver: false }).start()}
        onHoverOut={() => Animated.timing(hoverAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start()}
        onPress={onPress}
        style={{ flex: 1, width: '100%' }}
      >
        <Animated.View style={[
          styles.card, 
          { 
            borderColor, 
            shadowColor: NF_BLUE, 
            shadowOffset: { width: 0, height: 0 }, 
            shadowOpacity, 
            shadowRadius: 14, 
            elevation: 8 
          }
        ]}>
          <View style={[styles.iconBox, { backgroundColor: resource.iconBg }]}>
            <Text style={styles.icon}>{resource.icon}</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{resource.title}</Text>
            <Text style={styles.cardDesc}>{resource.description}</Text>
            <Text style={[styles.cardLink, { color: resource.accent }]}>{resource.linkLabel}</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Resources Screen ─────────────────────────────────────────────────────────
export default function ResourcesScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const headerOpacity = useRef(new Animated.Value(0)).current;
  // Start with hardcoded defaults — always visible instantly
  const [resources, setResources] = useState<Resource[]>(DEFAULT_RESOURCES);

  // Animate header once on mount
  useEffect(() => {
    Animated.timing(headerOpacity, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, []);

  const applyCard = useCallback((c: any) => {
    setResources(prev => prev.map(r =>
      r.id === c.id
        ? { id: c.id, title: c.title, description: c.description, icon: c.icon, iconBg: c.icon_bg, link: c.link, linkLabel: c.link_label, accent: c.accent_color }
        : r
    ));
  }, []);

  const syncCards = useCallback(() => {
    fetchResourceCards()
      .then(cards => {
        if (cards.length > 0) {
          setResources(cards.map(c => ({
            id: c.id,
            title: c.title,
            description: c.description,
            icon: c.icon,
            iconBg: c.icon_bg,
            link: c.link,
            linkLabel: c.link_label,
            accent: c.accent_color,
          })));
        }
      })
      .catch(() => {/* keep defaults */});
  }, []);

  // Fetch on focus + poll every 8s for saved changes
  useFocusEffect(
    useCallback(() => {
      syncCards();
      const interval = setInterval(syncCards, 8000);
      return () => clearInterval(interval);
    }, [syncCards])
  );

  // Realtime broadcast — receive live admin drafts instantly (before save)
  useEffect(() => {
    const channel = supabase
      .channel('resource-cards-live')
      .on('broadcast', { event: 'card-draft' }, ({ payload }) => {
        if (payload) applyCard(payload);
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [applyCard]);

  const isDesktop = width > 1024;
  const isTablet = width > 768 && width <= 1024;

  let columns = 1;
  if (isDesktop) columns = 3;
  else if (isTablet) columns = 2;

  const gap = spacing.md;
  const totalGapWidth = gap * (columns - 1);
  const containerPadding = spacing.lg * 2;
  const sidebarWidth = isDesktop ? 240 : 0;

  const cardWidth = columns === 1
    ? '100%'
    : (width - sidebarWidth - containerPadding - totalGapWidth) / columns;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => router.push('/(app)/focus')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹</Text>
            </Pressable>
            <View>
              <Text style={styles.pageTitle}>Resources</Text>
              <Text style={styles.pageSub}>Tools & guides for focus masters</Text>
            </View>
          </View>
          <View style={styles.todayIndicator}>
            <PulsingDot />
            <Text style={styles.todayIndicatorText}>Today • {DAY_NAMES[new Date().getDay()]}</Text>
          </View>
        </Animated.View>

        {/* Resource Cards Grid — defaults show immediately, DB data overlays when loaded */}
        <View style={styles.gridContainer}>
          {resources.map((resource, i) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              delay={i * 80}
              cardWidth={cardWidth}
              onPress={() => router.push({ pathname: '/(app)/resource-viewer', params: { cardId: resource.id } } as any)}
            />
          ))}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles (Fix #7: all NF Blue, zero Instagram colors) ─────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgBase },
  scroll: { padding: spacing.lg, gap: spacing.md },

  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 4 
  },
  pageTitle: {
    fontSize: typography.fontSizeXl,
    fontWeight: '800',
    color: NF_BLUE,        // was accentInstagram
    letterSpacing: -0.5,
  },
  pageSub: {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary,
    marginTop: 2,
  },

  todayIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(52, 211, 153, 0.1)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.25)'
  },
  todayIndicatorText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  // Grid container
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: 8,
  },

  // Cards
  card: {
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xl, padding: spacing.xl,
    flexDirection: 'column', gap: spacing.md, alignItems: 'flex-start',
  },
  iconBox: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 28 },
  cardContent: { flex: 1, gap: 8, marginTop: 4, width: '100%' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  cardDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  cardLink: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  backBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(74,144,226,0.12)', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 22, color: NF_BLUE, lineHeight: 28, fontWeight: '600' },
});
