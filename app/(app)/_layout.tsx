/**
 * NeuroFlow — App Layout
 * ✅ Desktop (width > 1024): permanent sidebar column on left, hamburger hidden, tab bar hidden
 * ✅ Mobile (width ≤ 1024): hamburger toggle, tab bar visible, sidebar slides in
 * ✅ useWindowDimensions for reactive breakpoint detection
 */

import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Home, CalendarDays, Zap, BookOpen } from 'lucide-react-native';
import { colors, radius, spacing } from '../../src/constants/theme';
import Sidebar from '../../src/components/Sidebar';
import { TasksProvider } from '../../src/lib/TasksContext';

const NF_BLUE = '#4A90E2';
const DESKTOP_BREAKPOINT = 1024;

const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
function getTodayAbbrev(): string {
  return DAY_ABBREVS[new Date().getDay()];
}

function BrandHeader() {
  return (
    <View style={hStyles.brandWrapper}>
      <Image
        source={require('../../assets/neuroflow-logo.jpg')}
        style={hStyles.logoImage}
      />
      <Text style={hStyles.brandName}>NeuroFlow</Text>
    </View>
  );
}

function HamburgerBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={hStyles.hamburger} accessibilityLabel="Toggle menu">
      <View style={hStyles.hLine} />
      <View style={hStyles.hLine} />
      <View style={hStyles.hLine} />
    </Pressable>
  );
}

function DayBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={hStyles.todayBtn}>
      <Text style={hStyles.todayText}>{getTodayAbbrev()}</Text>
    </Pressable>
  );
}

export default function AppLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width > DESKTOP_BREAKPOINT;
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const router = useRouter();

  return (
    <TasksProvider>
      <View style={[styles.root, isDesktop && styles.rootDesktop]}>
        {/* Desktop: permanent sidebar column */}
      {isDesktop && (
        <Sidebar visible={true} onClose={() => {}} isDesktop />
      )}

      {/* Main content area */}
      <View style={styles.mainContent}>
        <Tabs
          screenOptions={{
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.bgBase,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            } as any,
            headerShadowVisible: false,
            headerTintColor: colors.textPrimary,
            headerTitle: () => <BrandHeader />,
            headerTitleAlign: 'center',
            // Hide hamburger on desktop — show on mobile
            headerLeft: isDesktop
              ? () => null
              : () => <HamburgerBtn onPress={() => setSidebarVisible(true)} />,
            headerRight: () => <DayBtn onPress={() => router.push('/(app)/calendar')} />,

            tabBarActiveTintColor: NF_BLUE,
            tabBarInactiveTintColor: colors.textTertiary,
            // Hide tab bar on desktop (sidebar is the navigation)
            tabBarStyle: isDesktop
              ? { display: 'none' }
              : {
                  backgroundColor: colors.bgSecondary,
                  borderTopColor: colors.border,
                  paddingBottom: 4,
                  height: 60,
                },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={2} /> }} />
          <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} strokeWidth={2} /> }} />
          <Tabs.Screen name="focus" options={{ title: 'Focus', tabBarIcon: ({ color, size }) => <Zap color={color} size={size} strokeWidth={2} /> }} />
          <Tabs.Screen name="resources" options={{ title: 'Resources', tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} strokeWidth={2} /> }} />
          {/* Hidden screens — not in tab bar, accessible via router.push */}
          <Tabs.Screen name="all-actions" options={{ href: null, title: 'All Actions' }} />
          <Tabs.Screen name="session-log" options={{ href: null, title: 'Session Log' }} />
          <Tabs.Screen name="admin" options={{ href: null, title: 'Admin' }} />
        </Tabs>
      </View>

      {/* Mobile: overlay sidebar (hidden on desktop) */}
      {!isDesktop && (
        <Sidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} />
      )}
      </View>
    </TasksProvider>
  );
}

const hStyles = StyleSheet.create({
  brandWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoImage: { width: 28, height: 28, borderRadius: 6 },
  brandName: { fontSize: 17, fontWeight: '800', color: NF_BLUE, letterSpacing: -0.4 },

  hamburger: {
    marginLeft: spacing.md, width: 38, height: 38, borderRadius: radius.sm,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8,
  },
  hLine: { width: 18, height: 2, backgroundColor: colors.textPrimary, borderRadius: 2 },

  todayBtn: {
    marginRight: spacing.md, paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: radius.full, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: NF_BLUE + '55',
  },
  todayText: { fontSize: 12, fontWeight: '600', color: NF_BLUE },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Desktop: horizontal row — sidebar | content
  rootDesktop: { flexDirection: 'row' },
  mainContent: { flex: 1 },
});
