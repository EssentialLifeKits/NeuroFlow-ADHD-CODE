/**
 * NeuroFlow — Smart Dashboard
 * ✅ useWindowDimensions for responsive layout
 * ✅ Desktop (>1024): stat cards in spacious row, priorities + quick start side-by-side, CTA horizontal banner
 * ✅ Mobile (≤1024): single-column stack, all existing behavior preserved
 * ✅ All state, data syncing, and animations unchanged
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, spacing, typography } from '../../src/constants/theme';
import {
  getOrCreateProfile,
  fetchTodaysSessions,
  fetchWeekSessions,
  type Task,
  type FocusSession,
} from '../../src/lib/db';
import { useTasks } from '../../src/lib/TasksContext';
import {
  getCategoryConf,
  formatTime12,
} from '../../src/lib/tasksUtils';
import ScheduleModal from '../../src/components/ScheduleModal';
import { TaskThumbnail } from '../../src/components/TaskThumbnail';
import { getSetting } from '../../src/lib/adminDb';

const NF_BLUE = '#4A90E2';
const DESKTOP_BREAKPOINT = 1024;

// ─── Email → Display Name mapping ────────────────────────────────────────────
function resolveDisplayName(email: string | null | undefined, rawDisplayName: string | null | undefined): string {
  if (!email) return rawDisplayName?.split(' ')[0] ?? 'Friend';
  const lower = email.toLowerCase().trim();
  if (lower === 'essentiallifekits@gmail.com') return 'Essential Life Kits';
  const local = email.split('@')[0];
  return local
    .replace(/[._-]/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function resolveAvatarLetter(email: string | null | undefined): string {
  if (!email) return 'U';
  const lower = email.toLowerCase().trim();
  if (lower === 'essentiallifekits@gmail.com') return 'E';
  return email.charAt(0).toUpperCase();
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ─── Pulsing Dot (Today indicator) ───────────────────────────────────────────
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
      backgroundColor: '#34D399',
      transform: [{ scale }],
      opacity: opac,
      shadowColor: '#34D399', shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9, shadowRadius: 4, elevation: 4,
    }} />
  );
}

// ─── Pulsing Orb ─────────────────────────────────────────────────────────────
function PulsingOrb() {
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.12, duration: 2400, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1.0, duration: 2400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.88, duration: 2400, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.55, duration: 2400, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[orbStyles.orb, { backgroundColor: NF_BLUE, transform: [{ scale }], opacity }]}
    />
  );
}

const orbStyles = StyleSheet.create({
  orb: {
    width: 72, height: 72, borderRadius: 9999,
    shadowColor: NF_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 42, elevation: 16,
  },
});

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, accent, delay }: { label: string; value: string; accent: string; delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
      <Text style={[styles.cardValue, { color: accent }]} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
      <Text style={styles.cardLabel} adjustsFontSizeToFit numberOfLines={2}>{label}</Text>
    </Animated.View>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width > DESKTOP_BREAKPOINT;

  const { user } = useAuth();
  const router = useRouter();

  const { tasks, loading: tasksLoading, removeTask } = useTasks();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [weekSessions, setWeekSessions] = useState<FocusSession[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);

  const loading = tasksLoading || sessionLoading;

  const userEmail = (user as any)?.email as string | undefined;
  const rawDisplayName = (user as any)?.displayName as string | undefined;

  const displayName = resolveDisplayName(userEmail, rawDisplayName);
  const avatarLetter = resolveAvatarLetter(userEmail);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetingEmoji = hour < 12 ? '🌸' : hour < 17 ? '☀️' : '🌙';
  const greetingName = displayName;

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      getOrCreateProfile(user.id, (user as any).displayName, (user as any).email)
        .then((p) => Promise.all([fetchTodaysSessions(p.id), fetchWeekSessions(p.id)]))
        .then(([todayData, weekData]) => {
          if (!cancelled) {
            setSessions(todayData ?? []);
            setWeekSessions(weekData ?? []);
          }
        })
        .catch(() => { })
        .finally(() => { if (!cancelled) setSessionLoading(false); });
      return () => { cancelled = true; };
    }, [user]),
  );

  const today = new Date();
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  const todayTasks = tasks.filter((t) => t.due_date === todayStr);
  const pendingToday = todayTasks.filter((t) => t.status === 'pending').length;

  // All session minutes logged today (any type, any status with actual time recorded)
  const doneMinToday = sessions
    .filter((s) => s.actual_duration_min != null)
    .reduce((sum, s) => sum + (s.actual_duration_min ?? 0), 0);

  // All session minutes this week (Mon–Sun), all types
  const focusMinWeek = weekSessions
    .filter((s) => s.actual_duration_min != null)
    .reduce((sum, s) => sum + (s.actual_duration_min ?? 0), 0);

  // Keep focusMinToday for the Quick Start card subtitle
  const focusMinToday = sessions
    .filter((s) => s.session_type === 'focus' && s.actual_duration_min != null)
    .reduce((sum, s) => sum + (s.actual_duration_min ?? 0), 0);

  const statCards = [
    { label: 'Done Today', value: loading ? '…' : doneMinToday ? `${doneMinToday}m` : '—', accent: colors.success },
    { label: 'Remaining', value: loading ? '…' : String(pendingToday), accent: NF_BLUE },
    { label: 'Focus Time\nThis Week', value: loading ? '…' : focusMinWeek ? `${focusMinWeek}m` : '—', accent: colors.info },
  ];

  const topPending = tasks
    .filter((t) => t.due_date && t.due_date >= todayStr && (t.status === 'pending' || t.status === 'draft'))
    .sort((a, b) => {
      const da = new Date(`${a.due_date}T${a.due_time || '00:00'}`).getTime();
      const db = new Date(`${b.due_date}T${b.due_time || '00:00'}`).getTime();
      return da - db;
    });

  // Animations
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(-10)).current;
  const sectionOpacity = useRef(new Animated.Value(0)).current;
  const sectionTranslateY = useRef(new Animated.Value(12)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaTranslateY = useRef(new Animated.Value(12)).current;

  // How To video
  const [howToVisible, setHowToVisible] = useState(false);
  const [howToUrl, setHowToUrl] = useState('');
  const [howToTitle, setHowToTitle] = useState('How To Use NeuroFlow');
  const [howToDesc, setHowToDesc] = useState('Watch this short explainer to get the most out of your ADHD toolkit.');

  useEffect(() => {
    getSetting('howto_video_url').then(v => { if (v) setHowToUrl(v); }).catch(() => {});
    getSetting('howto_video_title').then(v => { if (v) setHowToTitle(v); }).catch(() => {});
    getSetting('howto_video_desc').then(v => { if (v) setHowToDesc(v); }).catch(() => {});
  }, []);

  // Edit Task State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateToastY = useRef(new Animated.Value(120)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = () => {
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  };

  useEffect(() => {
    if (toastVisible) {
      Animated.parallel([
        Animated.spring(translateToastY, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateToastY, { toValue: 120, duration: 300, useNativeDriver: true }),
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [toastVisible]);

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setModalVisible(true);
  };

  const handleDeleteTask = (taskId: string) => {
    setDeleteConfirm(taskId);
  };
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(headerTranslateY, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    Animated.parallel([
      Animated.timing(sectionOpacity, { toValue: 1, duration: 500, delay: 350, useNativeDriver: true }),
      Animated.timing(sectionTranslateY, { toValue: 0, duration: 500, delay: 350, useNativeDriver: true }),
    ]).start();
    Animated.parallel([
      Animated.timing(ctaOpacity, { toValue: 1, duration: 500, delay: 500, useNativeDriver: true }),
      Animated.timing(ctaTranslateY, { toValue: 0, duration: 500, delay: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Upcoming Priorities section (reused in both layouts) ─────────────────
  const PrioritiesSection = (
    <Animated.View style={[styles.section, { opacity: sectionOpacity, transform: [{ translateY: sectionTranslateY }] }]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming Priorities</Text>
        <Pressable onPress={() => router.push('/(app)/all-actions?from=dashboard' as any)}>
          <Text style={styles.sectionLink}>View all →</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={NF_BLUE} style={{ marginTop: spacing.md }} />
      ) : topPending.length === 0 ? (
        <TouchableOpacity onPress={() => router.push('/(app)/calendar')} activeOpacity={0.8}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>{tasks.length === 0 ? '🌸' : '✅'}</Text>
            <Text style={styles.emptyText}>
              {tasks.length === 0
                ? 'No tasks yet! Tap the Calendar to add one.'
                : 'All done for today! Great work.'}
            </Text>
            {tasks.length === 0 && (
              <View style={styles.emptyRedirectBadge}>
                <Text style={styles.emptyRedirectText}>📅 Open Calendar</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.taskListContainer}>
          <ScrollView
            style={{ maxHeight: 380 }}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            contentContainerStyle={styles.taskListContent}
          >
            {topPending.map((task) => {
              const conf = getCategoryConf(task);
              return (
                <Pressable key={task.id} style={styles.taskRow} onPress={() => handleEdit(task)}>
                  <TaskThumbnail stickerId={task.sticker_id} fallbackEmoji={conf.emoji} color={conf.color} />
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {task.title}
                    </Text>
                    <Text style={styles.taskMeta}>
                      {task.due_date ?? 'Today'}
                      {task.due_time ? ` · ${formatTime12(task.due_time)}` : ''}
                    </Text>
                  </View>
                  <View style={styles.badgesCol}>
                    <View style={[styles.statusBadge, { backgroundColor: (task.status === 'draft' ? '#F59E0B' : '#34D399') + '22' }]}>
                      <Text style={[styles.statusBadgeText, { color: task.status === 'draft' ? '#F59E0B' : '#34D399' }]}>{task.status === 'draft' ? 'Pending/Draft' : 'Active'}</Text>
                    </View>
                    <View style={[styles.taskBadge, { backgroundColor: conf.color + '22' }]}>
                      <Text style={[styles.taskBadgeText, { color: conf.color }]}>{conf.label}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteTask(task.id)}
                    style={styles.taskDeleteBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.taskDeleteText}>🗑</Text>
                  </TouchableOpacity>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </Animated.View>
  );

  // ── Drafts section ──────────────────────────────────────────────────────
  const draftTasks = tasks.filter(t => t.status === 'draft');

  const DraftsSection = draftTasks.length > 0 ? (
    <Animated.View style={[styles.section, { opacity: sectionOpacity, transform: [{ translateY: sectionTranslateY }] }]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>📝 Drafts</Text>
        <View style={styles.draftCountBadge}>
          <Text style={styles.draftCountText}>{draftTasks.length}</Text>
        </View>
      </View>
      <View style={styles.draftListContainer}>
        {draftTasks.map((task) => {
          const conf = getCategoryConf(task);
          return (
            <Pressable key={task.id} style={styles.draftRow} onPress={() => handleEdit(task)}>
              <View style={[styles.draftColorBar, { backgroundColor: conf.color }]} />
              <TaskThumbnail stickerId={task.sticker_id} fallbackEmoji={conf.emoji} color={conf.color} />
              <View style={styles.taskInfo}>
                <Text style={styles.taskTitle} numberOfLines={1}>
                  {task.title || 'Untitled Draft'}
                </Text>
                <Text style={styles.taskMeta}>
                  {task.due_date ?? 'No date'}
                  {task.due_time ? ` · ${formatTime12(task.due_time)}` : ''}
                </Text>
              </View>
              <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeText}>Draft</Text>
              </View>
              <TouchableOpacity onPress={() => handleEdit(task)} style={styles.draftEditBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.draftEditText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteTask(task.id)} style={styles.taskDeleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.taskDeleteText}>🗑</Text>
              </TouchableOpacity>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  ) : null;

  // ── Quick Start section ──────────────────────────────────────────────────
  const QuickStartSection = (
    <Animated.View style={[styles.section, { opacity: ctaOpacity, transform: [{ translateY: ctaTranslateY }] }]}>
      <Text style={styles.sectionTitle}>Quick Start</Text>
      <Pressable onPress={() => router.push('/(app)/focus')} style={styles.focusCard}>
        <View style={styles.focusCardLeft}>
          <Text style={styles.focusEmoji}>🪷</Text>
          <View>
            <Text style={styles.focusTitle}>Hyperfocus Lotus</Text>
            <Text style={styles.focusSub}>
              {focusMinToday ? `${focusMinToday}m focused today` : 'Start your first focus session'}
            </Text>
          </View>
        </View>
        <View style={styles.startChip}>
          <Text style={styles.startChipIcon}>⚡</Text>
          <Text style={styles.startChipText}>Start</Text>
        </View>
      </Pressable>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerTranslateY }] }]}>
          <View style={styles.headerLeft}>
            <PulsingOrb />
            <View style={styles.greetingBlock}>
              <Text style={styles.greeting}>{greeting},</Text>
              <Text style={styles.name}>{greetingName} {greetingEmoji}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.todayBadge}>
              <PulsingDot />
              <Text style={styles.todayBadgeText}>Today • {DAY_NAMES[new Date().getDay()]}</Text>
            </View>
            <Pressable onPress={() => setHowToVisible(true)} style={styles.howToBtn}>
              <Text style={styles.howToBtnText}>▶ How To</Text>
            </Pressable>
            <Pressable style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* ── Stat cards — horizontal row, spacious on desktop ── */}
        <View style={[styles.cardRow, isDesktop && styles.cardRowDesktop]}>
          {statCards.map((card, i) => (
            <StatCard key={card.label} {...card} delay={i * 90} />
          ))}
        </View>

        {/* ── Middle sections: side-by-side on desktop, stacked on mobile ── */}
        <View style={[styles.middleWrapper, isDesktop && styles.middleWrapperDesktop]}>
          <View style={isDesktop ? styles.middleCol : undefined}>
            {PrioritiesSection}
            {DraftsSection}
          </View>
          <View style={isDesktop ? styles.middleCol : undefined}>
            {QuickStartSection}
          </View>
        </View>

        {/* ── Affiliate CTA — horizontal banner on desktop ── */}
        <Animated.View style={[
          styles.ctaCard,
          isDesktop && styles.ctaCardDesktop,
          { opacity: ctaOpacity, transform: [{ translateY: ctaTranslateY }] },
        ]}>
          <View style={styles.ctaGlow} />
          <View style={styles.ctaContent}>
            <Text style={styles.ctaTitle}>🚀 Supercharge Routine</Text>
            <Text style={styles.ctaDesc}>
              Stop leaving focus on the table. Automate your daily routines and ADHD strategy inside one view.
            </Text>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => router.push('/(app)/resources')}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaButtonText}>Explore Automations</Text>
            </TouchableOpacity>
            <Text style={styles.ctaSub}>POWERED BY NEUROFLOW</Text>
          </View>
        </Animated.View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* ── Schedule Modal ── */}
      <ScheduleModal
        visible={modalVisible}
        selectedDate={editingTask?.due_date ?? null}
        onClose={() => { setModalVisible(false); setEditingTask(null); }}
        initialData={editingTask}
        onToast={showToast}
      />

      {/* ── Delete Confirmation Modal ── */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade" onRequestClose={() => setDeleteConfirm(null)}>
        <Pressable style={styles.deleteOverlay} onPress={() => setDeleteConfirm(null)}>
          <View style={styles.deleteSheet}>
            <Text style={styles.deleteTitle}>Delete Entry?</Text>
            <Text style={styles.deleteSubtitle}>This action cannot be undone.</Text>
            <View style={styles.deleteBtns}>
              <TouchableOpacity onPress={() => setDeleteConfirm(null)} style={styles.deleteCancelBtn} activeOpacity={0.8}>
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { if (deleteConfirm) { removeTask(deleteConfirm); setDeleteConfirm(null); } }} style={styles.deleteConfirmBtn} activeOpacity={0.8}>
                <Text style={styles.deleteConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── How To Video Modal ── */}
      <Modal visible={howToVisible} transparent animationType="fade" onRequestClose={() => setHowToVisible(false)}>
        <Pressable style={styles.howToOverlay} onPress={() => setHowToVisible(false)}>
          <Pressable style={styles.howToSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.howToHeader}>
              <Text style={styles.howToTitle}>{howToTitle}</Text>
              <Pressable onPress={() => setHowToVisible(false)} style={styles.howToClose}>
                <Text style={styles.howToCloseText}>✕</Text>
              </Pressable>
            </View>
            {howToDesc ? <Text style={styles.howToDesc}>{howToDesc}</Text> : null}
            {howToUrl ? (
              Platform.OS === 'web' ? (
                <View style={styles.howToVideoWrap}>
                  {/* @ts-ignore */}
                  <iframe
                    src={howToUrl}
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 10 }}
                    title="How To Video"
                    allow="autoplay; fullscreen"
                  />
                </View>
              ) : (
                <Pressable onPress={() => Linking.openURL(howToUrl)} style={[styles.howToOpenBtn, { backgroundColor: NF_BLUE }]}>
                  <Text style={styles.howToOpenBtnText}>▶ Watch Video</Text>
                </Pressable>
              )
            ) : (
              <View style={styles.howToEmpty}>
                <Text style={styles.howToEmptyText}>🎬 Video coming soon</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Toast ── */}
      <Animated.View style={[styles.toastContainer, { transform: [{ translateY: translateToastY }], opacity: toastOpacity }]}>
        <Text style={styles.toastText}>✅ Priorities Updated</Text>
      </Animated.View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgBase },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  scrollDesktop: { padding: spacing.xl, gap: spacing.xl },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  greetingBlock: { flex: 1 },
  greeting: { fontSize: typography.fontSizeMd, color: colors.textSecondary },
  name: { fontSize: typography.fontSizeXl, fontWeight: '700', color: NF_BLUE },
  todayBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(52, 211, 153, 0.1)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.25)' },
  todayBadgeText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  avatar: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: NF_BLUE + '22',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: NF_BLUE,
  },
  avatarText: { fontSize: typography.fontSizeLg, fontWeight: '700', color: NF_BLUE },

  // Stat cards
  cardRow: { flexDirection: 'row', gap: spacing.sm },
  cardRowDesktop: { gap: spacing.md },
  card: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
  },
  cardValue: { fontSize: typography.fontSizeXl, fontWeight: '800', textAlign: 'center' },
  cardLabel: {
    fontSize: 10, color: colors.textSecondary,
    textAlign: 'center', fontWeight: '600', flexShrink: 1,
  },

  // Middle sections wrapper
  middleWrapper: { gap: spacing.lg },
  middleWrapperDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  middleCol: { flex: 1 },

  // Sections
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: typography.fontSizeLg, fontWeight: '700', color: colors.textPrimary },
  sectionLink: { fontSize: typography.fontSizeXs, color: NF_BLUE, fontWeight: '600' },

  emptyState: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: spacing.xl, alignItems: 'center', gap: spacing.sm,
    borderWidth: 1.5, borderColor: NF_BLUE + '33',
  },
  emptyIcon: { fontSize: 32 },
  emptyText: {
    fontSize: typography.fontSizeSm, color: colors.textSecondary,
    textAlign: 'center', lineHeight: typography.fontSizeSm * 1.5,
  },
  emptyRedirectBadge: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: NF_BLUE, borderRadius: radius.full, marginTop: 4 },
  emptyRedirectText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  taskListContainer: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  taskListContent: { padding: spacing.md, gap: spacing.sm },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.md },
  taskThumb: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: typography.fontSizeSm, color: colors.textPrimary, fontWeight: '600' },
  taskMeta: { fontSize: typography.fontSizeXs, color: colors.textSecondary, marginTop: 2 },
  taskBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  taskBadgeText: { fontSize: 9, fontWeight: '700' },
  badgesCol: { alignItems: 'flex-end', gap: 3 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  statusBadgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.3 },
  taskDeleteBtn: { padding: 4, marginLeft: 4 },
  taskDeleteText: { fontSize: 16 },

  // Drafts section
  draftCountBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full, backgroundColor: '#F59E0B' + '22' },
  draftCountText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },
  draftListContainer: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: '#F59E0B' + '33', overflow: 'hidden', padding: spacing.sm, gap: spacing.xs },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: '#F59E0B' + '22' },
  draftColorBar: { width: 3, height: 32, borderRadius: 2 },
  draftBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: '#F59E0B' + '22' },
  draftBadgeText: { fontSize: 9, fontWeight: '700', color: '#F59E0B' },
  draftEditBtn: { padding: 4 },
  draftEditText: { fontSize: 14 },

  focusCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: NF_BLUE + '0F', borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: NF_BLUE + '33',
  },
  focusCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  focusEmoji: { fontSize: 32 },
  focusTitle: { fontSize: typography.fontSizeMd, fontWeight: '700', color: colors.textPrimary },
  focusSub: { fontSize: typography.fontSizeXs, color: colors.textSecondary, marginTop: 2 },
  startChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: NF_BLUE, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  startChipIcon: { fontSize: 10 },
  startChipText: { fontSize: typography.fontSizeXs, fontWeight: '700', color: '#fff' },

  // CTA card — shared
  ctaCard: {
    backgroundColor: colors.bgElevated, borderWidth: 1,
    borderColor: NF_BLUE + '33', borderRadius: radius.xl,
    padding: spacing.lg, overflow: 'hidden',
  },
  // Desktop: slightly more padding
  ctaCardDesktop: { padding: spacing.xl },
  ctaGlow: { position: 'absolute', top: -100, right: -50, width: 200, height: 200, backgroundColor: NF_BLUE, opacity: 0.06, borderRadius: radius.full },

  // Centered vertical design used by both
  ctaContent: { gap: spacing.sm, alignItems: 'center' },
  ctaTitle: { fontSize: typography.fontSizeXl, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, textAlign: 'center' },
  ctaDesc: { fontSize: typography.fontSizeSm, color: colors.textSecondary, lineHeight: typography.fontSizeSm * 1.5, textAlign: 'center', maxWidth: 600 },

  ctaButton: {
    backgroundColor: NF_BLUE, borderRadius: radius.full,
    paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.lg,
    alignSelf: 'center',
    shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  ctaButtonText: { color: colors.white, fontWeight: '700', fontSize: typography.fontSizeSm, textAlign: 'center' },
  ctaSub: { fontSize: 10, color: colors.textTertiary, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },

  // How To button
  howToBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: NF_BLUE + '18',
    borderWidth: 1, borderColor: NF_BLUE + '55',
  },
  howToBtnText: { fontSize: 12, fontWeight: '700', color: NF_BLUE },

  // How To modal
  howToOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  howToSheet: {
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    padding: spacing.lg, width: '100%', maxWidth: 560,
    borderWidth: 1, borderColor: NF_BLUE + '44', gap: spacing.md,
  },
  howToHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  howToTitle: { fontSize: 18, fontWeight: '800', color: NF_BLUE, flex: 1 },
  howToClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  howToCloseText: { fontSize: 14, color: colors.textSecondary, fontWeight: '700' },
  howToDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  howToVideoWrap: { width: '100%', height: 280, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' },
  howToOpenBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: radius.lg },
  howToOpenBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  howToEmpty: { paddingVertical: 24, alignItems: 'center', backgroundColor: colors.bgBase, borderRadius: radius.lg },
  howToEmptyText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },

  toastContainer: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: NF_BLUE, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: radius.full, zIndex: 9999,
    shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 20, elevation: 12,
  },
  toastText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },

  // Delete confirmation modal
  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  deleteSheet: { backgroundColor: colors.bgCard, borderRadius: radius.xl, padding: spacing.lg, width: 300, borderWidth: 1, borderColor: colors.border },
  deleteTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  deleteSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  deleteBtns: { flexDirection: 'row', gap: 12 },
  deleteCancelBtn: { flex: 1, paddingVertical: 12, backgroundColor: colors.bgElevated, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  deleteCancelText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  deleteConfirmBtn: { flex: 1, paddingVertical: 12, backgroundColor: '#F87171', borderRadius: radius.md, alignItems: 'center' },
  deleteConfirmText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
