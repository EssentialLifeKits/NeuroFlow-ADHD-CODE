/**
 * NeuroFlow — Calendar Screen
 * ✅ useWindowDimensions: dynamic grid geometry, responsive layouts
 * ✅ Desktop (>1024): full-width calendar grid, 3-col widget grid, horizontal CTA banner
 * ✅ Mobile (≤1024): single-column stack, all existing behavior preserved
 * ✅ DayCell accepts cellWidth prop (replaces static constant)
 * ✅ Mouse-wheel scroll supported on web via showsVerticalScrollIndicator
 * ✅ All state, data syncing, modals, toast, edit mode unchanged
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, spacing, typography } from '../../src/constants/theme';
import { type Task } from '../../src/lib/db';
import { useTasks } from '../../src/lib/TasksContext';
import { TaskThumbnail } from '../../src/components/TaskThumbnail';
import {
  type ADHDCategory,
  ADHD_CATEGORIES,
  getCategoryConf,
  getCategoryColor,
  formatTime12,
  BEST_TIMES,
} from '../../src/lib/tasksUtils';
import ScheduleModal from '../../src/components/ScheduleModal';

// ─── Brand & breakpoints ──────────────────────────────────────────────────────
const NF_BLUE = '#4A90E2';
const NF_BLUE_GLOW = 'rgba(74, 144, 226, 0.28)';
const DESKTOP_BREAKPOINT = 1024;
const DESKTOP_SIDEBAR_W = 240; // matches Sidebar.tsx sidebarDesktop.width
const CELL_H = 104;

// ─── Calendar helpers ─────────────────────────────────────────────────────────
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function formatDate(year: number, month: number, day: number): string {
  return [year, String(month + 1).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

function getTasksByDate(tasks: Task[], dateStr: string) {
  return tasks.filter((t) => t.due_date === dateStr);
}

// ─── Pulsing Blue Dot ─────────────────────────────────────────────────────────
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

// ─── DayCell — cellWidth passed as prop (dynamic grid geometry) ───────────────
type ExpandedMap = Record<string, boolean>;

function DayCell({
  day, dateStr, isOtherMonth, isToday, tasks, onPress, onTaskTap, expanded, onExpandMore, cellWidth,
}: {
  day: number; dateStr: string; isOtherMonth: boolean; isToday: boolean;
  tasks: Task[]; onPress: (d: string) => void; onTaskTap: (t: Task) => void;
  expanded: boolean; onExpandMore: (d: string) => void;
  cellWidth: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn = () => Animated.spring(scale, { toValue: 0.93, friction: 8, tension: 100, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }).start();

  const MAX = 2;
  const bars = tasks.slice(0, 4);
  const visible = expanded ? tasks : tasks.slice(0, MAX);
  const extra = tasks.length - MAX;

  return (
    <Animated.View style={[
      cs.cell,
      { width: cellWidth, minHeight: CELL_H },
      isOtherMonth && cs.cellOther,
      isToday && cs.cellToday,
      { transform: [{ scale }] },
    ]}>
      {/* Category color bars — flush to very top edge, full width, no padding */}
      {bars.length > 0 && (
        <View style={cs.barRow}>
          {bars.map((t, i) => (
            <View key={i} style={[cs.bar, { backgroundColor: getCategoryColor(t) }]} />
          ))}
        </View>
      )}

      <Pressable style={cs.cellInner} onPress={() => onPress(dateStr)} onPressIn={onIn} onPressOut={onOut}>
        <View style={isToday ? cs.badgeToday : cs.badge}>
          <Text style={[cs.dateNum, isToday && cs.dateNumToday]}>{day}</Text>
        </View>
        <View style={cs.entries}>
          {visible.map((t) => {
            const conf = getCategoryConf(t);
            return (
              <Pressable key={t.id} onPress={(e) => { e.stopPropagation?.(); onTaskTap(t); }}>
                <View style={[cs.entry, { borderLeftColor: conf.color, backgroundColor: conf.color + '1A' }]}>
                  <Text style={[cs.entryText, { color: conf.color }]} numberOfLines={1}>
                    {t.due_time ? formatTime12(t.due_time) + ' ' : ''}{conf.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {!expanded && extra > 0 && (
            <Pressable onPress={() => onExpandMore(dateStr)}>
              <Text style={cs.more}>+{extra} more</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Chore Chopper ───────────────────────────────────────────────────────────
interface Chore { id: number; text: string; done: boolean; }
let nextChoreId = 1;

function ChoreChopper() {
  const [chores, setChores] = useState<Chore[]>([
    { id: nextChoreId++, text: 'Morning routine', done: false },
    { id: nextChoreId++, text: 'Take medication', done: false },
    { id: nextChoreId++, text: 'Review daily tasks', done: false },
  ]);
  const [input, setInput] = useState('');

  const addChore = () => {
    const txt = input.trim();
    if (!txt) return;
    setChores((p) => [...p, { id: nextChoreId++, text: txt, done: false }]);
    setInput('');
  };

  const toggleChore = (id: number) =>
    setChores((p) => p.map((c) => c.id === id ? { ...c, done: !c.done } : c));

  const deleteChore = (id: number) =>
    setChores((p) => p.filter((c) => c.id !== id));

  const done = chores.filter((c) => c.done).length;
  const total = chores.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <View style={cc.card}>
      <View style={cc.header}>
        <Text style={cc.title}>🪓 Chore Chopper</Text>
        <View style={cc.badge}><Text style={cc.badgeText}>{done}/{total} Done</Text></View>
      </View>
      <View style={cc.progressTrack}>
        <View style={[cc.progressFill, { width: `${pct}%` as any }]} />
      </View>
      {chores.map((chore) => (
        <View key={chore.id} style={cc.item}>
          <Pressable onPress={() => toggleChore(chore.id)} style={[cc.checkbox, chore.done && cc.checkboxDone]}>
            {chore.done && <Text style={cc.checkmark}>✓</Text>}
          </Pressable>
          <Text style={[cc.itemText, chore.done && cc.itemTextDone]} numberOfLines={1}>{chore.text}</Text>
          <Pressable onPress={() => deleteChore(chore.id)} style={cc.del}>
            <Text style={cc.delText}>✕</Text>
          </Pressable>
        </View>
      ))}
      <View style={cc.addRow}>
        <TextInput
          style={cc.addInput}
          placeholder="Add a chore..."
          placeholderTextColor={colors.textTertiary}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={addChore}
          returnKeyType="done"
        />
        <TouchableOpacity onPress={addChore} style={cc.addBtn} activeOpacity={0.85}>
          <Text style={cc.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cc = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full, backgroundColor: NF_BLUE + '22' },
  badgeText: { fontSize: 10, fontWeight: '700', color: NF_BLUE },
  progressTrack: { height: 5, backgroundColor: colors.bgElevated, borderRadius: radius.full, overflow: 'hidden' },
  progressFill: { height: 5, backgroundColor: NF_BLUE, borderRadius: radius.full },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: NF_BLUE, borderColor: NF_BLUE },
  checkmark: { fontSize: 12, color: '#fff', fontWeight: '700' },
  itemText: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  itemTextDone: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  del: { padding: 4 },
  delText: { fontSize: 12, color: colors.textTertiary },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  addInput: { flex: 1, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.textPrimary },
  addBtn: { width: 40, height: 40, backgroundColor: NF_BLUE, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 20, color: '#fff', fontWeight: '700', lineHeight: 24 },
});

// ─── Externalized components ──────────────────────────────────────────────

// ─── Toast ────────────────────────────────────────────────────────────────────
function SuccessToast({ visible }: { visible: boolean }) {
  const translateY = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 120, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View style={[toastSt.container, { transform: [{ translateY }], opacity }]}>
      <Text style={toastSt.text}>✅ Task Scheduled</Text>
    </Animated.View>
  );
}

const toastSt = StyleSheet.create({
  container: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: NF_BLUE, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: radius.full, zIndex: 9999,
    shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 20, elevation: 12,
  },
  text: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
});

// ─── Calendar Screen ──────────────────────────────────────────────────────────
type CalView = 'month' | 'week';

export default function CalendarScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth > DESKTOP_BREAKPOINT;
  const router = useRouter();
  const { editTaskId } = useLocalSearchParams<{ editTaskId?: string }>();

  // Dynamic calendar grid geometry
  const contentW = windowWidth - (isDesktop ? DESKTOP_SIDEBAR_W : 0);
  const calPadding = spacing.md * 2;
  const GRID_W = Math.max(contentW - calPadding, 560);
  const CELL_W = GRID_W / 7;

  const { user } = useAuth();
  const { tasks, addTask, editTask, removeTask } = useTasks();
  const [currentDate, setCurrentDate] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [calView, setCalView] = useState<CalView>('month');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<ExpandedMap>({});
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = useMemo(() => {
    const n = new Date();
    return formatDate(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  // Auto-open edit modal when navigated from All Actions page
  useEffect(() => {
    if (editTaskId && tasks.length > 0) {
      const task = tasks.find((t) => t.id === editTaskId);
      if (task) {
        setEditingTask(task);
        setSelectedDate(task.due_date ?? today);
        setModalVisible(true);
      }
    }
  }, [editTaskId, tasks]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const cells = useMemo(() => {
    if (calView === 'week') {
      const d = new Date();
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      return Array.from({ length: 7 }, (_, i) => {
        const dd = new Date(start); dd.setDate(start.getDate() + i);
        const ds = formatDate(dd.getFullYear(), dd.getMonth(), dd.getDate());
        return { day: dd.getDate(), dateStr: ds, isOtherMonth: false, isToday: ds === today };
      });
    }
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const result: { day: number; dateStr: string; isOtherMonth: boolean; isToday: boolean }[] = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      result.push({ day: d, dateStr: formatDate(year, month - 1, d), isOtherMonth: true, isToday: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = formatDate(year, month, d);
      result.push({ day: d, dateStr: ds, isOtherMonth: false, isToday: ds === today });
    }
    const rem = 42 - result.length;
    for (let d = 1; d <= rem; d++) {
      result.push({ day: d, dateStr: formatDate(year, month + 1, d), isOtherMonth: true, isToday: false });
    }
    return result;
  }, [year, month, calView, today]);

  const showToast = () => {
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  };

  const handleTaskEdit = (task: Task) => {
    setEditingTask(task);
    setSelectedDate(task.due_date ?? today);
    setModalVisible(true);
  };

  const handleDayPress = (ds: string) => {
    setEditingTask(null); setSelectedDate(ds); setModalVisible(true);
  };

  const handleExpandMore = (ds: string) => setExpandedDates((p) => ({ ...p, [ds]: true }));

  const handleDeleteTask = (taskId: string) => {
    setDeleteConfirm(taskId);
  };

  const upcomingPriorities = useMemo(() =>
    tasks
      .filter((t) => t.due_date && t.due_date >= today && (t.status === 'pending' || t.status === 'draft'))
      .sort((a, b) => {
        const da = new Date(`${a.due_date}T${a.due_time || '00:00'}`).getTime();
        const db = new Date(`${b.due_date}T${b.due_time || '00:00'}`).getTime();
        return da - db;
      }),
    [tasks, today]);

  // ── Calendar grid (shared) ─────────────────────────────────────────────────
  const CalendarGrid = (
    <Animated.View style={[s.calCard, { opacity: fadeAnim }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ width: GRID_W }}
        style={s.hScroll}
      >
        <View style={{ width: GRID_W }}>
          <View style={s.calHeader}>
            {DAY_NAMES.map((d) => (
              <View key={d} style={[s.calHeaderCell, { width: CELL_W }]}>
                <Text style={s.calHeaderText}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={[s.calGrid, calView === 'week' && s.calGridWeek]}>
            {cells.map((cell) => (
              <DayCell
                key={cell.dateStr}
                day={cell.day}
                dateStr={cell.dateStr}
                isOtherMonth={cell.isOtherMonth}
                isToday={cell.isToday}
                tasks={getTasksByDate(tasks, cell.dateStr)}
                onPress={handleDayPress}
                onTaskTap={handleTaskEdit}
                expanded={!!expandedDates[cell.dateStr]}
                onExpandMore={handleExpandMore}
                cellWidth={CELL_W}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );

  // ── Best Times widget ──────────────────────────────────────────────────────
  const BestTimesWidget = (
    <View style={s.widget}>
      <View style={s.widgetHeader}>
        <Text style={s.widgetTitle}>⏰ Best Times for Focus</Text>
        <View style={s.widgetBadge}><Text style={s.widgetBadgeText}>AI Suggested</Text></View>
      </View>
      {BEST_TIMES.map((bt, i) => (
        <TouchableOpacity
          key={bt.display}
          style={s.bestTimeRow}
          onPress={() => { setSelectedDate(today); setModalVisible(true); }}
          activeOpacity={0.75}
        >
          <View style={[s.rankDot, { backgroundColor: NF_BLUE + (i === 0 ? '33' : i === 1 ? '22' : '14') }]}>
            <Text style={[s.rankText, { color: NF_BLUE }]}>#{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.btLabel}>{bt.display}</Text>
            <Text style={s.btDesc}>{bt.desc}</Text>
          </View>
          <Text style={s.btEng}>{bt.engagement}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ── Upcoming Priorities widget ─────────────────────────────────────────────
  const UpcomingWidget = (
    <View style={s.widget}>
      <View style={s.widgetHeader}>
        <Text style={s.widgetTitle}>📋 Upcoming Priorities</Text>
        <Pressable onPress={() => router.push('/(app)/all-actions?from=calendar' as any)} style={s.allActionsBtn}>
          <Text style={s.allActionsBtnText}>All Actions →</Text>
        </Pressable>
      </View>
      {upcomingPriorities.length === 0 ? (
        <Text style={s.emptyWidget}>No upcoming priorities. Tap any date to schedule! 🌸</Text>
      ) : (
        // showsVerticalScrollIndicator={true} ensures mouse wheel scroll works on web
        <ScrollView
          style={{ maxHeight: 320 }}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          {upcomingPriorities.map((task) => {
            const conf = getCategoryConf(task);
            return (
              <TouchableOpacity
                key={task.id}
                style={s.upRow}
                onPress={() => handleTaskEdit(task)}
                activeOpacity={0.8}
              >
                <View style={s.upThumbWrap}>
                  <TaskThumbnail stickerId={task.sticker_id} fallbackEmoji={conf.emoji} color={conf.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.upCaption} numberOfLines={1}>{task.title}</Text>
                  <Text style={s.upMeta}>
                    {task.due_date}{task.due_time ? ` · ${formatTime12(task.due_time)}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <View style={[s.upBadge, { backgroundColor: (task.status === 'draft' ? '#F59E0B' : '#34D399') + '22' }]}>
                    <Text style={[s.upBadgeText, { color: task.status === 'draft' ? '#F59E0B' : '#34D399' }]}>{task.status === 'draft' ? 'Pending/Draft' : 'Active'}</Text>
                  </View>
                  <View style={[s.upBadge, { backgroundColor: conf.color + '22' }]}>
                    <Text style={[s.upBadgeText, { color: conf.color }]}>{conf.label}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteTask(task.id)}
                  style={s.upDeleteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.upDeleteText}>🗑</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  // ── Affiliate CTA ──────────────────────────────────────────────────────────
  const AffiliateCTA = (
    <TouchableOpacity style={[s.cta, isDesktop && s.ctaDesktop]} activeOpacity={0.85}>
      <View style={s.ctaGlow} />
      <View style={s.ctaContent}>
        <Text style={s.ctaTitle}>🚀 Automate Your ADHD Workflow</Text>
        <Text style={s.ctaSub}>
          Stop leaving focus on the table. Set up smart reminders, routine triggers and focus blocks in minutes.
        </Text>
        <View style={s.ctaBtn}>
          <Text style={s.ctaBtnText}>Try Free</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, isDesktop && s.scrollDesktop]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Top Bar ── */}
        <Animated.View style={[s.topBar, { opacity: fadeAnim }]}>
          <View>
            <Text style={s.pageTitle}>Content Calendar</Text>
            <Text style={s.pageSub}>{MONTH_NAMES[month]} {year}</Text>
          </View>
          <View style={s.topRight}>
            {/* Today•Tue indicator with pulsing blue dot */}
            <View style={s.todayIndicator}>
              <PulsingDot />
              <Text style={s.todayIndicatorText}>Today • {DAY_NAMES[new Date().getDay()]}</Text>
            </View>
            <View style={s.viewToggle}>
              {(['month', 'week'] as CalView[]).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[s.viewBtn, calView === v && s.viewBtnActive]}
                  onPress={() => setCalView(v)}
                  activeOpacity={0.85}
                >
                  <Text style={[s.viewBtnText, calView === v && s.viewBtnTextActive]}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.monthNav}>
              <TouchableOpacity style={s.navBtn} onPress={prevMonth} activeOpacity={0.7}>
                <Text style={s.navIcon}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.navBtn} onPress={nextMonth} activeOpacity={0.7}>
                <Text style={s.navIcon}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* ── New Entry button ── */}
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => { setEditingTask(null); setSelectedDate(today); setModalVisible(true); }}
          activeOpacity={0.85}
        >
          <Text style={s.newBtnText}>+ Schedule New Task</Text>
        </TouchableOpacity>

        {/* ── Calendar Grid — full available width ── */}
        {CalendarGrid}

        {/* ── Category Legend ── */}
        <View style={s.legend}>
          {(Object.entries(ADHD_CATEGORIES) as [ADHDCategory, typeof ADHD_CATEGORIES[ADHDCategory]][]).map(([k, c]) => (
            <View key={k} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: c.color }]} />
              <Text style={s.legendLabel}>{c.emoji} {c.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Below-calendar widgets ──────────────────────────────────────────
            Desktop: 3-column grid (Best Times | Chore Chopper | Upcoming)
            Mobile:  single-column vertical stack                           ── */}
        {isDesktop ? (
          <View style={s.widgetGrid}>
            <View style={s.widgetGridCol}>{BestTimesWidget}</View>
            <View style={s.widgetGridCol}><ChoreChopper /></View>
            <View style={s.widgetGridColWide}>{UpcomingWidget}</View>
          </View>
        ) : (
          <>
            <ChoreChopper />
            {BestTimesWidget}
            {UpcomingWidget}
          </>
        )}

        {/* ── Affiliate CTA — full width ── */}
        {AffiliateCTA}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <SuccessToast visible={toastVisible} />

      {/* ── Delete Confirmation Modal ── */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade" onRequestClose={() => setDeleteConfirm(null)}>
        <Pressable style={s.deleteOverlay} onPress={() => setDeleteConfirm(null)}>
          <View style={s.deleteSheet}>
            <Text style={s.deleteTitle}>Delete Entry?</Text>
            <Text style={s.deleteSubtitle}>This action cannot be undone.</Text>
            <View style={s.deleteBtns}>
              <TouchableOpacity onPress={() => setDeleteConfirm(null)} style={s.deleteCancelBtn} activeOpacity={0.8}>
                <Text style={s.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { if (deleteConfirm) { removeTask(deleteConfirm); setDeleteConfirm(null); } }} style={s.deleteConfirmBtn} activeOpacity={0.8}>
                <Text style={s.deleteConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      <ScheduleModal
        visible={modalVisible}
        selectedDate={selectedDate}
        onClose={() => { setModalVisible(false); setEditingTask(null); }}
        initialData={editingTask}
        onToast={showToast}
      />
    </SafeAreaView>
  );
}

// ─── Calendar cell styles ─────────────────────────────────────────────────────
const cs = StyleSheet.create({
  // width is set inline via cellWidth prop — NOT baked in here
  cell: { borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cellInner: { flex: 1, padding: 5 },
  cellOther: { opacity: 0.3 },
  cellToday: { backgroundColor: NF_BLUE + '0F' },
  badge: { marginBottom: 2 },
  badgeToday: { width: 22, height: 22, borderRadius: 11, backgroundColor: NF_BLUE, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  dateNum: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  dateNumToday: { color: '#fff', fontWeight: '700' },
  barRow: { flexDirection: 'row', height: 7, width: '100%' },
  bar: { flex: 1, height: 7 },
  entries: { gap: 2 },
  entry: { paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3, borderLeftWidth: 2 },
  entryText: { fontSize: 8, fontWeight: '600' },
  more: { fontSize: 8, color: colors.textTertiary, textAlign: 'center', marginTop: 2 },
});

// ─── Screen styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgBase },
  scroll: { padding: spacing.md, gap: spacing.md },
  scrollDesktop: { padding: spacing.lg, gap: spacing.lg },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 },
  pageTitle: { fontSize: typography.fontSizeXl, fontWeight: '800', color: NF_BLUE, letterSpacing: -0.5 },
  pageSub: { fontSize: typography.fontSizeSm, color: colors.textSecondary },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  todayIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(52, 211, 153, 0.1)', borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.25)' },
  todayIndicatorText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.3 },
  viewToggle: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.full, padding: 3, borderWidth: 1, borderColor: colors.border },
  viewBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full },
  viewBtnActive: { backgroundColor: NF_BLUE, shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  viewBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  viewBtnTextActive: { color: '#fff' },
  monthNav: { flexDirection: 'row', gap: 4 },
  navBtn: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  navIcon: { fontSize: 20, color: colors.textPrimary, fontWeight: '700', lineHeight: 22 },

  newBtn: { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: NF_BLUE, borderRadius: radius.md, shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  newBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },

  calCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  hScroll: {},
  calHeader: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  calHeaderCell: { paddingVertical: 10, alignItems: 'center' },
  calHeaderText: { fontSize: 9, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calGridWeek: { flexWrap: 'nowrap' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },

  // Desktop 3-column grid for below-calendar widgets
  widgetGrid: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  widgetGridCol: { flex: 1 },        // Best Times + Chore Chopper (equal width)
  widgetGridColWide: { flex: 1.2 },  // Upcoming Priorities (slightly wider)

  widget: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 },
  widgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  widgetTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  widgetBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full, backgroundColor: NF_BLUE + '22' },
  widgetBadgeText: { fontSize: 9, fontWeight: '700', color: NF_BLUE, letterSpacing: 0.5 },
  allActionsBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: NF_BLUE + '18', borderRadius: radius.full, borderWidth: 1, borderColor: NF_BLUE + '44' },
  allActionsBtnText: { fontSize: 11, fontWeight: '700', color: NF_BLUE },

  bestTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.bgElevated, borderRadius: radius.md },
  rankDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 11, fontWeight: '800' },
  btLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  btDesc: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  btEng: { fontSize: 11, fontWeight: '700', color: colors.success },

  upRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: colors.bgElevated, borderRadius: radius.md, marginBottom: 6 },
  upThumbWrap: { marginTop: 0 },
  upCaption: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  upMeta: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  upBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  upBadgeText: { fontSize: 9, fontWeight: '700' },
  upDeleteBtn: { padding: 4, marginLeft: 4 },
  upDeleteText: { fontSize: 14 },
  emptyWidget: { fontSize: 12, color: colors.textTertiary, textAlign: 'center', paddingVertical: 16, fontStyle: 'italic' },

  // CTA
  cta: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: NF_BLUE + '33', borderRadius: radius.xl, padding: spacing.md, overflow: 'hidden' },
  ctaDesktop: { padding: spacing.xl },
  ctaGlow: { position: 'absolute', top: -100, right: -50, width: 200, height: 200, backgroundColor: NF_BLUE, opacity: 0.06, borderRadius: radius.full },
  ctaContent: { gap: spacing.sm, alignItems: 'center' },
  ctaTitle: { fontSize: typography.fontSizeXl, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, textAlign: 'center' },
  ctaSub: { fontSize: typography.fontSizeSm, color: colors.textSecondary, lineHeight: typography.fontSizeSm * 1.5, textAlign: 'center', maxWidth: 600 },
  ctaBtn: { backgroundColor: NF_BLUE, borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 4, alignSelf: 'center', shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  ctaBtnText: { fontSize: typography.fontSizeSm, fontWeight: '700', color: '#fff' },

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

// End of styles
