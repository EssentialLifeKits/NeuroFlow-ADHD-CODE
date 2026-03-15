/**
 * NeuroFlow — All Scheduled Actions
 * Hidden page (not in tab bar) — accessible from Calendar > Upcoming Priorities
 * - Full chronological list of all tasks, grouped by month
 * - Jump To dropdown (all 12 months)
 * - Status badges: Draft / Pending / Active
 * - Category color glow borders
 * - Delete (✕) and Edit (opens calendar with editTaskId param) per entry
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, spacing, typography } from '../../src/constants/theme';
import {
  getOrCreateProfile,
  type Task,
  type UserProfile,
} from '../../src/lib/db';
import { useTasks } from '../../src/lib/TasksContext';
import {
  ADHD_CATEGORIES,
  getCategoryConf,
  formatTime12,
} from '../../src/lib/tasksUtils';
import ScheduleModal from '../../src/components/ScheduleModal';
import { TaskThumbnail } from '../../src/components/TaskThumbnail';

const NF_BLUE = '#4A90E2';
const DESKTOP_BREAKPOINT = 1024;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getStatusBadge(task: Task): { label: string; color: string } {
  if (task.status === 'completed') return { label: 'Completed', color: '#34D399' };
  if (task.status === 'draft')     return { label: 'Draft',         color: '#F59E0B' };
  return                                  { label: 'Active',  color: '#34D399' };
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AllActionsScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width > DESKTOP_BREAKPOINT;
  const router = useRouter();
  const { from } = useLocalSearchParams();
  const { user } = useAuth();

  const { tasks, removeTask } = useTasks();
  const [jumpMonth, setJumpMonth] = useState<number | null>(null);
  const [showJumpPicker, setShowJumpPicker] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = () => {
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  };

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  // Chronological sort
  const sorted = useMemo(() => [...tasks].sort((a, b) => {
    const da = new Date(`${a.due_date ?? '9999-12-31'}T${a.due_time ?? '00:00'}`).getTime();
    const db = new Date(`${b.due_date ?? '9999-12-31'}T${b.due_time ?? '00:00'}`).getTime();
    return da - db;
  }), [tasks]);

  // Filter by selected month
  const displayed = useMemo(() => {
    if (jumpMonth === null) return sorted;
    return sorted.filter((t) => {
      if (!t.due_date) return false;
      const m = parseInt(t.due_date.split('-')[1]) - 1;
      return m === jumpMonth;
    });
  }, [sorted, jumpMonth]);

  // Group by "Month Year"
  const grouped = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    displayed.forEach((t) => {
      if (!t.due_date) {
        const key = 'No Date';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
        return;
      }
      const parts = t.due_date.split('-');
      const key = `${MONTH_NAMES[parseInt(parts[1]) - 1]} ${parts[0]}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [displayed]);

  const handleDelete = async (taskId: string) => {
    await removeTask(taskId);
    setDeleteConfirm(null);
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setModalVisible(true);
  };

  const translateToastY = useRef(new Animated.Value(120)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

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

  const handleBack = () => {
    if (from === 'calendar') {
      router.replace('/(app)/calendar');
    } else {
      router.replace('/(app)');
    }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      {/* ── Header ── */}
      <Animated.View style={[st.header, { opacity: fadeAnim }]}>
        <Pressable onPress={handleBack} style={st.backBtn}>
          <Text style={st.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={st.title}>All Scheduled Actions</Text>
        <Pressable onPress={() => setShowJumpPicker(true)} style={st.jumpBtn}>
          <Text style={st.jumpBtnText}>
            {jumpMonth !== null ? MONTH_NAMES[jumpMonth].slice(0, 3) : 'Jump To'} ▾
          </Text>
        </Pressable>
      </Animated.View>

      {/* ── Stats strip: 3 badges only ── */}
      <View style={st.statsStrip}>
        <View style={st.statItem}>
          <Text style={st.statNum}>{tasks.length}</Text>
          <Text style={st.statLabel}>Total</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Text style={[st.statNum, { color: '#F59E0B' }]}>
            {tasks.filter(t => t.status === 'pending' || t.status === 'draft').length}
          </Text>
          <Text style={st.statLabel}>Pending/Draft</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Text style={[st.statNum, { color: '#34D399' }]}>
            {tasks.filter(t => t.status === 'pending').length}
          </Text>
          <Text style={st.statLabel}>Active</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={[st.scroll, isDesktop && st.scrollDesktop]}
      >
        {tasks.length === 0 ? (
          <View style={st.empty}>
            <Text style={st.emptyIcon}>📋</Text>
            <Text style={st.emptyText}>No scheduled actions yet.</Text>
            <TouchableOpacity
              onPress={() => router.push('/(app)/calendar')}
              style={st.goCalBtn}
              activeOpacity={0.85}
            >
              <Text style={st.goCalBtnText}>📅 Go to Calendar</Text>
            </TouchableOpacity>
          </View>
        ) : displayed.length === 0 ? (
          <View style={st.empty}>
            <Text style={st.emptyIcon}>🔍</Text>
            <Text style={st.emptyText}>
              No tasks in {jumpMonth !== null ? MONTH_NAMES[jumpMonth] : 'this period'}.
            </Text>
            <Pressable onPress={() => setJumpMonth(null)} style={st.clearJumpBtn}>
              <Text style={st.clearJumpText}>Show All</Text>
            </Pressable>
          </View>
        ) : (
          Object.entries(grouped).map(([monthKey, monthTasks]) => (
            <View key={monthKey} style={st.monthGroup}>
              <View style={st.monthLabelRow}>
                <Text style={st.monthLabel}>{monthKey}</Text>
                <Text style={st.monthCount}>{monthTasks.length} {monthTasks.length === 1 ? 'entry' : 'entries'}</Text>
              </View>

              {monthTasks.map((task) => {
                const conf = getCategoryConf(task);
                const status = getStatusBadge(task);
                return (
                  <View
                    key={task.id}
                    style={[st.entry, {
                      borderColor: conf.color + '50',
                      shadowColor: conf.color,
                    }]}
                  >
                    {/* Left category color bar */}
                    <View style={[st.categoryBar, { backgroundColor: conf.color }]} />

                    <View style={st.entryContent}>
                      {/* Top row: thumb/emoji + title/meta + badges */}
                      <View style={st.entryTop}>
                        <View style={st.entryThumbWrap}>
                          <TaskThumbnail stickerId={task.sticker_id} fallbackEmoji={conf.emoji} color={conf.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.entryTitle} numberOfLines={2}>{task.title}</Text>
                          <Text style={st.entryMeta}>
                            {task.due_date ?? '—'}
                            {task.due_time ? ` · ${formatTime12(task.due_time)}` : ''}
                          </Text>
                        </View>
                        <View style={st.badgesCol}>
                          <View style={[st.catBadge, { backgroundColor: conf.color + '22' }]}>
                            <Text style={[st.catBadgeText, { color: conf.color }]}>{conf.label}</Text>
                          </View>
                          <View style={[st.statusBadge, { backgroundColor: status.color + '22' }]}>
                            <Text style={[st.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                          </View>
                        </View>
                      </View>

                      {task.description ? (
                        <Text style={st.entryDesc} numberOfLines={2}>{task.description}</Text>
                      ) : null}

                      {/* Action buttons */}
                      <View style={st.entryActions}>
                        <TouchableOpacity
                          onPress={() => handleEdit(task)}
                          style={st.editBtn}
                          activeOpacity={0.8}
                        >
                          <Text style={st.editBtnText}>✏️  Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setDeleteConfirm(task.id)}
                          style={st.deleteBtn}
                          activeOpacity={0.8}
                        >
                          <Text style={st.deleteBtnText}>✕  Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* ── Jump To Month Modal ── */}
      <Modal visible={showJumpPicker} transparent animationType="fade" onRequestClose={() => setShowJumpPicker(false)}>
        <Pressable style={st.jumpOverlay} onPress={() => setShowJumpPicker(false)}>
          <View style={st.jumpSheet}>
            <Text style={st.jumpTitle}>Jump To Month</Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              <Pressable
                onPress={() => { setJumpMonth(null); setShowJumpPicker(false); }}
                style={[st.jumpItem, jumpMonth === null && st.jumpItemActive]}
              >
                <Text style={[st.jumpItemText, jumpMonth === null && st.jumpItemTextActive]}>All Months</Text>
              </Pressable>
              {MONTH_NAMES.map((name, i) => (
                <Pressable
                  key={name}
                  onPress={() => { setJumpMonth(i); setShowJumpPicker(false); }}
                  style={[st.jumpItem, jumpMonth === i && st.jumpItemActive]}
                >
                  <Text style={[st.jumpItemText, jumpMonth === i && st.jumpItemTextActive]}>{name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* ── Delete Confirm Modal ── */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade" onRequestClose={() => setDeleteConfirm(null)}>
        <Pressable style={st.jumpOverlay} onPress={() => setDeleteConfirm(null)}>
          <View style={[st.jumpSheet, { padding: spacing.lg }]}>
            <Text style={st.jumpTitle}>Delete Entry?</Text>
            <Text style={st.deleteConfirmText}>This action cannot be undone.</Text>
            <View style={st.deleteConfirmBtns}>
              <TouchableOpacity onPress={() => setDeleteConfirm(null)} style={st.cancelBtn} activeOpacity={0.8}>
                <Text style={st.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteConfirm && handleDelete(deleteConfirm)} style={st.confirmDeleteBtn} activeOpacity={0.8}>
                <Text style={st.confirmDeleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Schedule Modal ── */}
      <ScheduleModal
        visible={modalVisible}
        selectedDate={editingTask?.due_date ?? null}
        onClose={() => { setModalVisible(false); setEditingTask(null); }}
        initialData={editingTask}
        onToast={showToast}
      />

      {/* ── Toast ── */}
      <Animated.View style={[st.toastContainer, { transform: [{ translateY: translateToastY }], opacity: toastOpacity }]}>
        <Text style={st.toastText}>✅ Actions Updated</Text>
      </Animated.View>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgBase },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  backBtn: { paddingVertical: 8, paddingRight: 12 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: NF_BLUE },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  jumpBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: colors.bgCard, borderWidth: 1,
    borderColor: NF_BLUE + '55', borderRadius: radius.full,
  },
  jumpBtnText: { fontSize: 12, fontWeight: '700', color: NF_BLUE },

  statsStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly',
    paddingVertical: 12, backgroundColor: colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: typography.fontSizeLg, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: 10, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },

  scroll: { padding: spacing.md, gap: spacing.md },
  scrollDesktop: { padding: spacing.lg, gap: spacing.lg, maxWidth: 860, alignSelf: 'center', width: '100%' },

  empty: { alignItems: 'center', paddingVertical: 64, gap: 16 },
  emptyIcon: { fontSize: 52 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
  goCalBtn: { marginTop: 8, paddingHorizontal: 22, paddingVertical: 11, backgroundColor: NF_BLUE, borderRadius: radius.full },
  goCalBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  clearJumpBtn: { paddingHorizontal: 20, paddingVertical: 9, backgroundColor: colors.bgCard, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  clearJumpText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  monthGroup: { gap: 8 },
  monthLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 2 },
  monthLabel: { fontSize: 11, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase' },
  monthCount: { fontSize: 10, color: colors.textTertiary },

  entry: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  categoryBar: { width: 4 },
  entryContent: { flex: 1, padding: spacing.md, gap: 10 },
  entryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  entryThumbWrap: { marginTop: 2 },
  entryTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, lineHeight: 20 },
  entryMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 3 },
  badgesCol: { gap: 4, alignItems: 'flex-end', flexShrink: 0 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  catBadgeText: { fontSize: 9, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  statusBadgeText: { fontSize: 9, fontWeight: '700' },
  entryDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },

  entryActions: {
    flexDirection: 'row', gap: 8,
    paddingTop: 8, marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  editBtn: { flex: 1, paddingVertical: 9, backgroundColor: NF_BLUE + '18', borderRadius: radius.sm, alignItems: 'center' },
  editBtnText: { fontSize: 12, fontWeight: '700', color: NF_BLUE },
  deleteBtn: { flex: 1, paddingVertical: 9, backgroundColor: '#F87171' + '18', borderRadius: radius.sm, alignItems: 'center' },
  deleteBtnText: { fontSize: 12, fontWeight: '700', color: '#F87171' },

  jumpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  jumpSheet: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    width: 300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jumpTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  jumpItem: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.sm },
  jumpItemActive: { backgroundColor: NF_BLUE + '22' },
  jumpItemText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  jumpItemTextActive: { color: NF_BLUE, fontWeight: '700' },

  deleteConfirmText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  deleteConfirmBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, backgroundColor: colors.bgElevated, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  confirmDeleteBtn: { flex: 1, paddingVertical: 12, backgroundColor: '#F87171', borderRadius: radius.md, alignItems: 'center' },
  confirmDeleteBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  toastContainer: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: NF_BLUE, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: radius.full, zIndex: 9999,
    shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 20, elevation: 12,
  },
  toastText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
});
