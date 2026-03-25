/**
 * NeuroFlow — Hyperfocus Lotus (Premium ADHD Timer)
 * ─────────────────────────────────────────────────────────────────────────────
 * New features added:
 *  ✅ 25m Focus / 5m Short Break / 15m Long Break tabs → fully functional
 *     live countdown timer
 *  ✅ "Download the NeuroFlow Deep Work Blueprint" — sleek blue hyperlink
 *     centered above the timer
 *  ✅ Distraction Parking Lot — text input + saved list BELOW active timer
 *  ✅ Productivity Insights — logged sessions saved in local state (persists
 *     for the session + written to DB via completeFocusSession)
 *  ✅ Breathing ring animations on running state
 *  ✅ Mood check-in after session completion
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  Animated,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Play, Pause, Square, Trash2, ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, spacing, typography } from '../../src/constants/theme';
import {
  getOrCreateProfile,
  createFocusSession,
  completeFocusSession,
  abandonFocusSession,
  deleteFocusSession,
  updateSessionNote,
  fetchTodaysSessions,
  type FocusSession,
  type SessionType,
  type UserProfile,
} from '../../src/lib/db';

// ─── NeuroFlow Blue ───────────────────────────────────────────────────────────
const NF_BLUE = '#4A90E2';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Shows exact duration: 45s · 1m 30s · 5m */
function formatDuration(mins: number): string {
  const totalSec = Math.round(mins * 60);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function PulsingDot() {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opac = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.5, duration: 1400, useNativeDriver: true }),
          Animated.timing(opac, { toValue: 1, duration: 1400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.7, duration: 1400, useNativeDriver: true }),
          Animated.timing(opac, { toValue: 0.5, duration: 1400, useNativeDriver: true }),
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

// ─── Session tabs ─────────────────────────────────────────────────────────────
const SESSIONS: { type: SessionType; label: string; duration: number; color: string; emoji: string }[] = [
  { type: 'focus', label: '25m Focus', duration: 25, color: NF_BLUE, emoji: '🪷' },
  { type: 'short_break', label: '5m Short Break', duration: 5, color: colors.success, emoji: '🌿' },
  { type: 'long_break', label: '15m Long Break', duration: 15, color: colors.accentPurple, emoji: '🌙' },
];

type TimerState = 'idle' | 'running' | 'paused';

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmt(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }
function sessionLabel(t: SessionType) { return SESSIONS.find((s) => s.type === t)?.label ?? t; }

// ─── Distraction Item ─────────────────────────────────────────────────────────
interface Distraction { id: number; text: string; timestamp: string; }

// ─── Productivity Insight record ──────────────────────────────────────────────
interface Insight {
  id: string;
  sessionType: SessionType;
  plannedMin: number;
  actualMin: number;
  mood: number | null;
  completedAt: string;
}

// ─── Mood Modal ───────────────────────────────────────────────────────────────
const MOODS = [
  { emoji: '😞', label: 'Rough' },
  { emoji: '😕', label: 'Meh' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😊', label: 'Great' },
];

function MoodModal({
  visible,
  onSubmit,
  sessionColor,
  sessionEmoji,
  sessionLabel: sLabel,
  isAbandon,
}: {
  visible: boolean;
  onSubmit: (m: number) => void;
  sessionColor: string;
  sessionEmoji: string;
  sessionLabel: string;
  isAbandon: boolean;
}) {
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const celebScale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 7, tension: 45, useNativeDriver: true }),
        Animated.spring(celebScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
      ]).start();

      // Fire confetti — big burst for full completion, small effort burst for abandon
      if (typeof window !== 'undefined') {
        import('canvas-confetti').then((mod) => {
          const confetti = mod.default;
          if (!isAbandon) {
            // Full celebration — 3-burst pattern
            confetti({
              particleCount: 90,
              spread: 70,
              origin: { x: 0.5, y: 0.35 },
              colors: [sessionColor, '#ffffff', sessionColor + 'cc', '#ffffffaa'],
              scalar: 1.1,
              gravity: 0.9,
              drift: 0.1,
            });
            setTimeout(() => confetti({
              particleCount: 50,
              spread: 50,
              angle: 60,
              origin: { x: 0.15, y: 0.4 },
              colors: [sessionColor, '#ffffff'],
              scalar: 0.9,
            }), 150);
            setTimeout(() => confetti({
              particleCount: 50,
              spread: 50,
              angle: 120,
              origin: { x: 0.85, y: 0.4 },
              colors: [sessionColor, '#ffffff'],
              scalar: 0.9,
            }), 200);
          } else {
            // Small effort burst — every minute counts!
            confetti({
              particleCount: 30,
              spread: 55,
              origin: { x: 0.5, y: 0.4 },
              colors: [sessionColor, '#ffffff', sessionColor + '99'],
              scalar: 0.8,
              gravity: 1.1,
            });
          }
        }).catch(() => { });
      }
    } else {
      opacity.setValue(0);
      scale.setValue(0.88);
      celebScale.setValue(0.6);
    }
  }, [visible]);

  const headline = isAbandon
    ? '⏹ Session ended'
    : sLabel.includes('Focus')
      ? '🎉 You crushed it!'
      : sLabel.includes('Short')
        ? '🌿 Break complete!'
        : '🌙 Long break done!';

  const sub = isAbandon
    ? 'Good effort — every minute counts.'
    : 'Amazing work. How are you feeling?';

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={[md.overlay, { backgroundColor: `${sessionColor}18` }]}>
        {/* Glow backdrop */}
        <View style={[md.glowCircle, { backgroundColor: sessionColor + '22', shadowColor: sessionColor }]} />
        <Animated.View style={[
          md.sheet,
          {
            opacity,
            transform: [{ scale }],
            borderColor: sessionColor + '55',
            borderTopWidth: 3,
            borderTopColor: sessionColor,
          },
        ]}>
          {/* Celebration icon */}
          <Animated.Text style={[md.emoji, { transform: [{ scale: celebScale }] }]}>
            {isAbandon ? '⏹' : sessionEmoji}
          </Animated.Text>

          {/* Colored headline */}
          <Text style={[md.title, { color: sessionColor }]}>{headline}</Text>
          <Text style={md.sessionTag}>{sLabel}</Text>
          <Text style={md.sub}>{sub}</Text>

          {/* Mood row */}
          <View style={md.row}>
            {MOODS.map((m, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => onSubmit(i + 1)}
                style={[md.btn, { borderColor: sessionColor + '44' }]}
                activeOpacity={0.7}
              >
                <Text style={md.moodEmoji}>{m.emoji}</Text>
                <Text style={[md.moodLabel, { color: sessionColor }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const md = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  glowCircle: {
    position: 'absolute',
    width: 320, height: 320,
    borderRadius: 160,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 60,
    elevation: 0,
  },
  sheet: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  emoji: { fontSize: 48, marginBottom: 2 },
  title: { fontSize: typography.fontSizeXl, fontWeight: '800', textAlign: 'center' },
  sessionTag: { fontSize: typography.fontSizeXs, color: colors.textTertiary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  sub: { fontSize: typography.fontSizeSm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, width: '100%' },
  btn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1 },
  moodEmoji: { fontSize: 24 },
  moodLabel: { fontSize: 9, fontWeight: '700' },
});

// ─── History row ──────────────────────────────────────────────────────────────
function HistoryRow({
  session,
  onRemove,
  onEditNote,
}: {
  session: FocusSession;
  onRemove: (id: string) => void;
  onEditNote: (session: FocusSession) => void;
}) {
  const dot = session.status === 'completed' ? colors.success : session.status === 'abandoned' ? colors.error : colors.textMuted;
  const mood = session.mood_after ? MOODS[session.mood_after - 1]?.emoji : null;
  const mins = session.actual_duration_min ?? 0;
  const minLabel = mins > 0 ? formatDuration(mins) : '0s';
  const statusSuffix = session.status === 'completed' ? 'Completed' : session.status === 'abandoned' ? 'Ended early' : '';
  const durationLabel = statusSuffix ? `${minLabel} ${statusSuffix}` : minLabel;
  return (
    <View style={hr.card}>
      <View style={[hr.colorBar, { backgroundColor: dot }]} />
      <View style={hr.body}>
        <View style={hr.topRow}>
          <View style={[hr.dot, { backgroundColor: dot }]} />
          <Text style={hr.label} numberOfLines={1}>{sessionLabel(session.session_type)} · {durationLabel}</Text>
          {mood && <Text style={hr.mood}>{mood}</Text>}
          <Text style={hr.time}>
            {new Date(session.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        {/* Note preview snippet — always visible */}
        {session.notes && (
          <Text style={hr.notesText} numberOfLines={1}>📝 {session.notes}</Text>
        )}
        {/* Note action button — "📝 View Note" or "+ Add note" */}
        <TouchableOpacity onPress={() => onEditNote(session)} activeOpacity={0.7} style={hr.noteBtn}>
          <Text style={session.notes ? hr.noteBtnTextHas : hr.noteBtnTextAdd}>
            {session.notes ? '📝 View Note' : '+ Add note'}
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => onRemove(session.id)} style={hr.delBtn} activeOpacity={0.7}>
        <Trash2 size={13} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

const hr = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  colorBar: { width: 3, alignSelf: 'stretch' },
  body: { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  label: { flex: 1, fontSize: typography.fontSizeSm, color: colors.textPrimary, fontWeight: '500' },
  mood: { fontSize: 14 },
  time: { fontSize: typography.fontSizeXs, color: colors.textMuted },
  notesText: { fontSize: typography.fontSizeXs, color: colors.textSecondary, fontStyle: 'italic' },
  noteBtn: { alignSelf: 'flex-start', marginTop: 2, paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.full, borderWidth: 1, borderColor: NF_BLUE + '55', backgroundColor: NF_BLUE + '12' },
  noteBtnTextHas: { fontSize: 10, fontWeight: '700', color: NF_BLUE },
  noteBtnTextAdd: { fontSize: 10, fontWeight: '600', color: colors.textTertiary },
  delBtn: {
    padding: spacing.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
});

// ─── Diary Modal ──────────────────────────────────────────────────────────────
function DiaryModal({ visible, text, onChangeText, onSave, onSkip }: {
  visible: boolean;
  text: string;
  onChangeText: (t: string) => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
      ]).start();
    } else { opacity.setValue(0); scale.setValue(0.92); }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={dm.overlay}>
        <Animated.View style={[dm.sheet, { opacity, transform: [{ scale }] }]}>
          <Text style={dm.emoji}>📝</Text>
          <Text style={dm.title}>Session Diary</Text>
          <Text style={dm.sub}>Optional — jot down any thoughts from this session</Text>
          <TextInput
            style={dm.input}
            multiline
            numberOfLines={4}
            placeholder="How did it go? What did you accomplish?"
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={onChangeText}
            textAlignVertical="top"
          />
          <View style={dm.btnRow}>
            <TouchableOpacity onPress={onSkip} style={dm.skipBtn} activeOpacity={0.75}>
              <Text style={dm.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} style={dm.saveBtn} activeOpacity={0.85}>
              <Text style={dm.saveText}>💾 Save Note</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.bgCard, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 480, gap: spacing.md },
  emoji: { fontSize: 36, textAlign: 'center' },
  title: { fontSize: typography.fontSizeXl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  sub: { fontSize: typography.fontSizeSm, color: colors.textSecondary, textAlign: 'center' },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.fontSizeSm,
    color: colors.textPrimary,
    minHeight: 100,
  },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  skipBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  skipText: { fontSize: typography.fontSizeSm, color: colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: NF_BLUE, alignItems: 'center' },
  saveText: { fontSize: typography.fontSizeSm, color: '#fff', fontWeight: '700' },
});

// ─── View Logs Button (hover effect on web) ───────────────────────────────────
function ViewLogsButton({ onPress, style, textStyle }: { onPress: () => void; style: any; textStyle: any }) {
  const [hovered, setHovered] = useState(false);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[style, hovered && { backgroundColor: '#3578c8', shadowOpacity: 0.75, shadowRadius: 20 }]}
      {...(typeof window !== 'undefined' ? {
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
      } : {})}
    >
      <Text style={textStyle}>📋 View All Session Logs</Text>
    </TouchableOpacity>
  );
}

// ─── Hyperfocus Lotus ─────────────────────────────────────────────────────────
export default function FocusScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Timer state
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [secondsLeft, setSecondsLeft] = useState(SESSIONS[0].duration * 60);
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [showMood, setShowMood] = useState(false);
  const [starting, setStarting] = useState(false);

  // Session Diary
  const [showDiary, setShowDiary] = useState(false);
  const [diaryText, setDiaryText] = useState('');
  const pendingRef = useRef<{ session: FocusSession; elapsed: number; mood: number; isAbandon: boolean } | null>(null);

  // Note editing (for existing sessions)
  const [editingNoteSession, setEditingNoteSession] = useState<FocusSession | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  // Distraction Parking Lot
  const [distractionInput, setDistractionInput] = useState('');
  const [distractions, setDistractions] = useState<Distraction[]>([]);
  let distractionId = useRef(1);

  // Productivity Insights
  const [insights, setInsights] = useState<Insight[]>([]);

  // PDF popup
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfFullscreen, setPdfFullscreen] = useState(false);

  // Audio player PiP
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioWide, setAudioWide] = useState(false);
  // Drag state — starts fixed bottom-right, switches to left/top when dragged
  const [audioPos, setAudioPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const endReasonRef = useRef<'complete' | 'abandon'>('complete');

  const cfg = SESSIONS[selectedIdx];

  // ─── Animations ───────────────────────────────────────────────────────────
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(-8)).current;
  const outerScale = useRef(new Animated.Value(0.98)).current;
  const outerOpacity = useRef(new Animated.Value(0.07)).current;
  const middleScale = useRef(new Animated.Value(0.99)).current;
  const middleOpacity = useRef(new Animated.Value(0.11)).current;
  const orbEmojiScale = useRef(new Animated.Value(1)).current;
  const loopOuter = useRef<Animated.CompositeAnimation | null>(null);
  const loopMiddle = useRef<Animated.CompositeAnimation | null>(null);
  const loopOrb = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(headerTranslateY, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (timerState === 'running') {
      loopOuter.current = Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(outerScale, { toValue: 1.10, duration: 3200, useNativeDriver: true }),
          Animated.timing(outerOpacity, { toValue: 0.18, duration: 3200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(outerScale, { toValue: 0.98, duration: 3200, useNativeDriver: true }),
          Animated.timing(outerOpacity, { toValue: 0.07, duration: 3200, useNativeDriver: true }),
        ]),
      ]));
      loopOuter.current.start();

      loopMiddle.current = Animated.loop(Animated.sequence([
        Animated.delay(400),
        Animated.parallel([
          Animated.timing(middleScale, { toValue: 1.06, duration: 2600, useNativeDriver: true }),
          Animated.timing(middleOpacity, { toValue: 0.26, duration: 2600, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(middleScale, { toValue: 0.99, duration: 2600, useNativeDriver: true }),
          Animated.timing(middleOpacity, { toValue: 0.11, duration: 2600, useNativeDriver: true }),
        ]),
      ]));
      loopMiddle.current.start();

      loopOrb.current = Animated.loop(Animated.sequence([
        Animated.timing(orbEmojiScale, { toValue: 1.06, duration: 2000, useNativeDriver: true }),
        Animated.timing(orbEmojiScale, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ]));
      loopOrb.current.start();
    } else {
      loopOuter.current?.stop();
      loopMiddle.current?.stop();
      loopOrb.current?.stop();
      Animated.parallel([
        Animated.timing(outerScale, { toValue: 0.98, duration: 400, useNativeDriver: true }),
        Animated.timing(outerOpacity, { toValue: 0.07, duration: 400, useNativeDriver: true }),
        Animated.timing(middleScale, { toValue: 0.99, duration: 400, useNativeDriver: true }),
        Animated.timing(middleOpacity, { toValue: 0.11, duration: 400, useNativeDriver: true }),
        Animated.timing(orbEmojiScale, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
    return () => {
      loopOuter.current?.stop();
      loopMiddle.current?.stop();
      loopOrb.current?.stop();
    };
  }, [timerState]);

  // ─── Data — load profile + sessions every time screen is focused ──────────
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      const fallbackProfile: UserProfile = {
        id: user.id, auth_user_id: user.id,
        email: (user as any).email ?? '',
        display_name: (user as any).displayName ?? 'User',
        avatar_url: null, timezone: 'UTC', onboarded: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      getOrCreateProfile(user.id, (user as any).displayName, (user as any).email)
        .catch(() => fallbackProfile)
        .then((p) => {
          if (cancelled) return;
          setProfile(p);
          return fetchTodaysSessions(p.id);
        })
        .then((data) => { if (!cancelled && data) setSessions(data); })
        .catch(() => { });
      return () => { cancelled = true; };
    }, [user]),
  );

  // ─── Countdown ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            setTimeout(() => handleTimerDone(), 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerState]);

  const handleTimerDone = useCallback(() => { setTimerState('idle'); setShowMood(true); }, []);

  // ─── Controls ─────────────────────────────────────────────────────────────
  const handleStart = async () => {
    let p = profile;
    if (!p && user) {
      p = {
        id: user.id, auth_user_id: user.id,
        email: (user as any).email ?? '',
        display_name: (user as any).displayName ?? 'User',
        avatar_url: null, timezone: 'UTC', onboarded: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      setProfile(p);
    }
    if (!p) return;
    setStarting(true);
    try {
      const s = await createFocusSession({ user_id: p.id, session_type: cfg.type, planned_duration_min: cfg.duration, status: 'active', started_at: new Date().toISOString() });
      setActiveSession(s);
      startTimeRef.current = new Date();
      setTimerState('running');
    } catch {
      const local: FocusSession = {
        id: `local-${Date.now()}`, user_id: p.id, task_id: null, label: null,
        session_type: cfg.type, planned_duration_min: cfg.duration, actual_duration_min: null,
        status: 'active', mood_before: null, mood_after: null, notes: null,
        started_at: new Date().toISOString(), ended_at: null, created_at: new Date().toISOString(),
      };
      setActiveSession(local);
      startTimeRef.current = new Date();
      setTimerState('running');
    } finally {
      setStarting(false);
    }
  };

  const handlePause = () => setTimerState((p) => (p === 'running' ? 'paused' : 'running'));

  const handleStop = () => {
    endReasonRef.current = 'abandon';
    setTimerState('idle');
    setShowMood(true);
  };

  // Mood selected → store pending data, show diary
  const handleMoodSubmit = (mood: number) => {
    setShowMood(false);
    // Store exact elapsed time as fractional minutes (e.g. 0.75 = 45s) — no rounding, no minimum
    const elapsedMs = startTimeRef.current ? Date.now() - startTimeRef.current.getTime() : cfg.duration * 60000;
    const elapsed = Math.max(elapsedMs / 60000, 1 / 60); // at least 1 second
    if (activeSession) {
      pendingRef.current = { session: activeSession, elapsed, mood, isAbandon: endReasonRef.current === 'abandon' };
    }
    setDiaryText('');
    setShowDiary(true);
  };

  // Diary saved or skipped → finalize session in DB, reset timer
  const handleDiaryFinish = async (notes: string | null) => {
    setShowDiary(false);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      const { session, elapsed, mood, isAbandon } = pending;
      const isLocal = session.id.startsWith('local-');
      const updated = {
        ...session,
        status: (isAbandon ? 'abandoned' as const : 'completed' as const),
        actual_duration_min: elapsed,
        mood_after: mood,
        notes: notes ?? null,
        ended_at: new Date().toISOString(),
      };
      // Always update local state immediately so it shows in Today's Sessions
      setSessions((p) => [updated, ...p]);
      setInsights((p) => [{ id: session.id, sessionType: session.session_type, plannedMin: session.planned_duration_min, actualMin: elapsed, mood, completedAt: new Date().toISOString() }, ...p]);
      // Persist to DB only for real sessions (not local fallback IDs)
      if (!isLocal) {
        try {
          if (isAbandon) {
            await abandonFocusSession(session.id, elapsed, mood, notes);
          } else {
            await completeFocusSession(session.id, elapsed, mood, notes);
          }
        } catch { }
      }
    }
    endReasonRef.current = 'complete';
    setActiveSession(null);
    startTimeRef.current = null;
    setSecondsLeft(cfg.duration * 60);
  };

  // Delete a session from today's history
  const handleRemoveSession = async (sessionId: string) => {
    setSessions((p) => p.filter((s) => s.id !== sessionId));
    try { await deleteFocusSession(sessionId); } catch { }
  };

  // Open note editor for an existing session
  const handleEditNote = (sess: FocusSession) => {
    setEditingNoteSession(sess);
    setEditNoteText(sess.notes ?? '');
  };

  // Save edited note to DB + local state
  const handleSaveEditedNote = async (notes: string | null) => {
    const sess = editingNoteSession;
    setEditingNoteSession(null);
    setEditNoteText('');
    if (!sess) return;
    try {
      await updateSessionNote(sess.id, notes);
      setSessions((p) => p.map((s) => s.id === sess.id ? { ...s, notes: notes ?? null } : s));
    } catch { }
  };

  const handleSelectSession = (i: number) => {
    if (timerState !== 'idle') return;
    setSelectedIdx(i);
    setSecondsLeft(SESSIONS[i].duration * 60);
  };

  // ─── Distraction Parking Lot ───────────────────────────────────────────────
  const parkDistraction = () => {
    const txt = distractionInput.trim();
    if (!txt) return;
    const now = new Date();
    setDistractions((p) => [{
      id: distractionId.current++,
      text: txt,
      timestamp: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    }, ...p]);
    setDistractionInput('');
  };

  const removeDistraction = (id: number) => setDistractions((p) => p.filter((d) => d.id !== id));

  // ─── Stats ────────────────────────────────────────────────────────────────
  const completedFocus = sessions.filter((s) => s.session_type === 'focus' && s.status === 'completed');
  const totalMin = completedFocus.reduce((sum, s) => sum + (s.actual_duration_min ?? 0), 0);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Header ── */}
        <Animated.View style={[s.header, { opacity: headerOpacity, transform: [{ translateY: headerTranslateY }] }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => router.push('/(app)/calendar')} style={s.backBtn} activeOpacity={0.7}>
              <ArrowLeft size={16} color={NF_BLUE} />
            </TouchableOpacity>
            <View>
              <Text style={s.title}>Hyperfocus Lotus</Text>
              <Text style={s.subtitle}>Deep work, ADHD-friendly</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <View style={s.todayBadge}>
              <PulsingDot />
              <Text style={s.todayBadgeText}>Today • {DAY_NAMES[new Date().getDay()]}</Text>
            </View>
            <View style={s.statsBox}>
              <Text style={[s.statsValue, { color: cfg.color }]}>{totalMin}m</Text>
              <Text style={s.statsLabel}>focused today</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Session type tabs — Fix #5: perfectly centered, no overlap ── */}
        <View style={s.typeRow}>
          {SESSIONS.map((sess, i) => (
            <TouchableOpacity
              key={sess.type}
              onPress={() => handleSelectSession(i)}
              activeOpacity={0.75}
              style={[
                s.typeBtn,
                { borderColor: sess.color },
                selectedIdx === i && { backgroundColor: sess.color },
                timerState !== 'idle' && s.typeBtnDisabled,
              ]}
            >
              <Text style={[s.typeBtnEmoji]}>{sess.emoji}</Text>
              <Text
                style={[s.typeBtnLabel, { color: sess.color }, selectedIdx === i && { color: '#fff' }]}
                adjustsFontSizeToFit
                numberOfLines={1}
                minimumFontScale={0.7}
              >
                {sess.label}
              </Text>
              <Text
                style={[s.typeBtnDur, { color: sess.color }, selectedIdx === i && { color: 'rgba(255,255,255,0.8)' }]}
                numberOfLines={1}
              >
                {sess.duration}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Deep Work Blueprint link — opens PDF popup ── */}
        <TouchableOpacity onPress={() => setPdfOpen(true)} activeOpacity={0.7} style={s.blueprintLink}>
          <Text style={s.blueprintLinkText}>📘 Download the NeuroFlow Deep Work Blueprint</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setAudioOpen(true)} activeOpacity={0.7} style={[s.blueprintLink, { marginTop: 4 }]}>
          <Text style={s.blueprintLinkText}>🎧 Listen to the Deep Work Audio Blueprint</Text>
        </TouchableOpacity>

        {/* ── Lotus Orb (timer display) ── */}
        <View style={s.orbArea}>
          <Animated.View style={[s.ring, s.ringOuter, { borderColor: cfg.color, opacity: outerOpacity, transform: [{ scale: outerScale }] }]} />
          <Animated.View style={[s.ring, s.ringMiddle, { borderColor: cfg.color, opacity: middleOpacity, transform: [{ scale: middleScale }] }]} />
          <View style={[s.orbCenter, { backgroundColor: cfg.color + '15' }]}>
            <Animated.View style={{ transform: [{ scale: orbEmojiScale }] }}>
              <Text style={s.orbEmoji}>{cfg.emoji}</Text>
            </Animated.View>
            <Text style={[s.timerDisplay, { color: cfg.color }]}>{fmt(secondsLeft)}</Text>
            <Text style={s.timerLabel}>
              {timerState === 'idle' ? cfg.label : timerState === 'paused' ? 'Paused' : 'In Flow ✦'}
            </Text>
          </View>
        </View>

        {/* ── Controls ── */}
        <View style={s.controls}>
          {timerState === 'idle' ? (
            <TouchableOpacity
              onPress={handleStart}
              style={[s.startBtn, { backgroundColor: cfg.color }]}
              disabled={starting}
              activeOpacity={0.85}
            >
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Play size={20} color="#fff" fill="#fff" />
                  <Text style={s.startBtnText}>Start Session</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={s.activeControls}>
              <TouchableOpacity onPress={handleStop} style={s.stopBtn}>
                <Square size={20} color={colors.error} fill={colors.error} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePause} style={[s.pauseBtn, { backgroundColor: cfg.color }]} activeOpacity={0.85}>
                {timerState === 'paused'
                  ? <Play size={24} color="#fff" fill="#fff" />
                  : <Pause size={24} color="#fff" fill="#fff" />
                }
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Distraction Parking Lot — always visible, active below timer ── */}
        <View style={s.parkingCard}>
          <View style={s.parkingHeader}>
            <Text style={s.parkingTitle}>🛑 Distraction Parking Lot</Text>
            <Text style={s.parkingSubtitle}>Park it here. Come back later. Keep the clock running.</Text>
          </View>
          <View style={s.parkingInputRow}>
            <TextInput
              style={s.parkingInput}
              placeholder="Type a distracting thought..."
              placeholderTextColor={colors.textTertiary}
              value={distractionInput}
              onChangeText={setDistractionInput}
              onSubmitEditing={parkDistraction}
              returnKeyType="done"
            />
            <TouchableOpacity onPress={parkDistraction} style={s.parkBtn} activeOpacity={0.85}>
              <Text style={s.parkBtnText}>Park</Text>
            </TouchableOpacity>
          </View>
          {distractions.length === 0 ? (
            <Text style={s.parkEmpty}>Nothing parked yet. Stay focused! 🎯</Text>
          ) : (
            <ScrollView style={s.parkList} showsVerticalScrollIndicator nestedScrollEnabled>
              {distractions.map((d) => (
                <View key={d.id} style={s.parkItem}>
                  <View style={s.parkItemLeft}>
                    <Text style={s.parkItemTime}>{d.timestamp}</Text>
                    <Text style={s.parkItemText}>{d.text}</Text>
                  </View>
                  <Pressable onPress={() => removeDistraction(d.id)} style={s.parkItemDel}>
                    <Trash2 size={14} color={colors.textTertiary} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Productivity Insights ── */}
        {insights.length > 0 && (
          <View style={s.insightsCard}>
            <Text style={s.insightsTitle}>📊 Productivity Insights</Text>
            <Text style={s.insightsSub}>Your logged session progress</Text>
            {insights.map((ins, idx) => {
              const sess = SESSIONS.find((ss) => ss.type === ins.sessionType);
              const moodEm = ins.mood ? MOODS[ins.mood - 1]?.emoji : '';
              return (
                <View key={ins.id + idx} style={s.insightRow}>
                  <View style={[s.insightDot, { backgroundColor: sess?.color ?? NF_BLUE }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.insightLabel}>{sess?.label ?? ins.sessionType}</Text>
                    <Text style={s.insightMeta}>
                      {formatDuration(ins.actualMin)} of {ins.plannedMin}m planned
                      {moodEm ? `  ${moodEm}` : ''}
                    </Text>
                  </View>
                  <Text style={s.insightTime}>
                    {new Date(ins.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              );
            })}

            {/* Summary */}
            <View style={s.insightSummary}>
              <Text style={s.insightSummaryText}>
                🔥 {insights.filter((i) => i.sessionType === 'focus').length} focus sessions ·{' '}
                {formatDuration(insights.filter((i) => i.sessionType === 'focus').reduce((a, b) => a + b.actualMin, 0))} total
              </Text>
            </View>
          </View>
        )}

        {/* ── Today's session history (from DB) ── */}
        <View style={s.historyCard}>
          <Text style={s.historyTitle}>
            Today · {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </Text>
          {sessions.length === 0 ? (
            <Text style={s.historyEmpty}>No sessions yet today. Start one above!</Text>
          ) : (
            <ScrollView
              style={s.historyScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              scrollEnabled
              bounces={false}
            >
              {sessions.map((sess) => (
                <HistoryRow key={sess.id} session={sess} onRemove={handleRemoveSession} onEditNote={handleEditNote} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── View All Session Logs link ── */}
        <ViewLogsButton onPress={() => router.push('/(app)/session-log')} style={s.viewLogsBtn} textStyle={s.viewLogsBtnText} />

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <MoodModal
        visible={showMood}
        onSubmit={handleMoodSubmit}
        sessionColor={cfg.color}
        sessionEmoji={cfg.emoji}
        sessionLabel={cfg.label}
        isAbandon={endReasonRef.current === 'abandon'}
      />
      <DiaryModal
        visible={showDiary}
        text={diaryText}
        onChangeText={setDiaryText}
        onSave={() => handleDiaryFinish(diaryText.trim() || null)}
        onSkip={() => handleDiaryFinish(null)}
      />

      {/* ── Note Edit Modal — tap "Add note" or existing note to open ── */}
      <Modal visible={!!editingNoteSession} transparent animationType="fade" onRequestClose={() => setEditingNoteSession(null)}>
        <View style={dm.overlay}>
          <Animated.View style={dm.sheet}>
            <Text style={dm.emoji}>📝</Text>
            <Text style={dm.title}>Session Note</Text>
            <Text style={dm.sub}>Edit or delete your note for this session</Text>
            <TextInput
              style={dm.input}
              multiline
              numberOfLines={4}
              placeholder="Jot down any thoughts from this session..."
              placeholderTextColor={colors.textTertiary}
              value={editNoteText}
              onChangeText={setEditNoteText}
              textAlignVertical="top"
              autoFocus
            />
            <View style={dm.btnRow}>
              <TouchableOpacity
                onPress={() => handleSaveEditedNote(null)}
                style={[dm.skipBtn, { borderColor: colors.error + '55' }]}
                activeOpacity={0.75}
              >
                <Text style={[dm.skipText, { color: colors.error }]}>🗑 Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSaveEditedNote(editNoteText.trim() || null)}
                style={dm.saveBtn}
                activeOpacity={0.85}
              >
                <Text style={dm.saveText}>💾 Save</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setEditingNoteSession(null)} activeOpacity={0.7} style={{ alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontSize: typography.fontSizeXs, color: colors.textTertiary }}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* ── PDF Popup Modal ── */}
      <Modal visible={pdfOpen} transparent animationType="fade" onRequestClose={() => setPdfOpen(false)}>
        <View style={s.pdfOverlay}>
          <View style={[s.pdfSheet, pdfFullscreen && s.pdfSheetFull]}>
            {/* Header bar */}
            <View style={s.pdfHeader}>
              <Text style={s.pdfHeaderTitle}>📘 Deep Work Blueprint</Text>
              <View style={s.pdfHeaderBtns}>
                <TouchableOpacity onPress={() => setPdfFullscreen(!pdfFullscreen)} style={s.pdfHeaderBtn} activeOpacity={0.7}>
                  <Text style={s.pdfHeaderBtnText}>{pdfFullscreen ? '⊡' : '⛶'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setPdfOpen(false); setPdfFullscreen(false); }} style={s.pdfHeaderBtn} activeOpacity={0.7}>
                  <Text style={s.pdfHeaderBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* PDF iframe */}
            {React.createElement('iframe', {
              src: 'https://drive.google.com/file/d/13VjjxS5zr4BXc-icAp9SDY8YGd_lEzM2/preview',
              style: {
                width: '100%',
                flex: 1,
                border: 'none',
                borderRadius: '0 0 16px 16px',
                minHeight: pdfFullscreen ? '80vh' : 480,
              },
              title: 'NeuroFlow Deep Work Blueprint',
            })}
          </View>
        </View>
      </Modal>


      {/* ── Audio Player PiP — fixed to viewport, draggable ── */}
      {audioOpen && React.createElement('div', {
        style: {
          position: 'fixed',
          right: audioPos ? undefined : 20,
          bottom: audioPos ? undefined : 100,
          left: audioPos?.left,
          top: audioPos?.top,
          width: audioWide ? 480 : 300,
          backgroundColor: colors.bgCard,
          borderRadius: 20,
          border: `1px solid ${NF_BLUE}44`,
          boxShadow: `0 4px 24px ${NF_BLUE}33`,
          zIndex: 9999,
          overflow: 'hidden',
          userSelect: 'none',
        },
      }, [
        // Drag handle header
        React.createElement('div', {
          key: 'header',
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', borderBottom: `1px solid ${colors.border}`,
            cursor: 'grab', backgroundColor: colors.bgSecondary,
          },
          onMouseDown: (e: any) => {
            const el = e.currentTarget.parentElement;
            const rect = el.getBoundingClientRect();
            dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
            const onMove = (me: MouseEvent) => {
              if (!dragRef.current) return;
              const newLeft = dragRef.current.startLeft + (me.clientX - dragRef.current.startX);
              const newTop = dragRef.current.startTop + (me.clientY - dragRef.current.startY);
              setAudioPos({ left: Math.max(0, newLeft), top: Math.max(0, newTop) });
            };
            const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          },
        }, [
          React.createElement('div', { key: 'left', style: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 } }, [
            React.createElement('div', { key: 'art', style: { width: 32, height: 32, borderRadius: 8, backgroundColor: `${NF_BLUE}22`, border: `1px solid ${NF_BLUE}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 } }, '🎧'),
            React.createElement('div', { key: 'info', style: { minWidth: 0 } }, [
              React.createElement('div', { key: 't', style: { fontSize: 11, fontWeight: 700, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, 'Deep Work Audio Blueprint'),
              React.createElement('div', { key: 's', style: { fontSize: 9, color: NF_BLUE, marginTop: 2 } }, 'NeuroFlow · Focus Series'),
            ]),
          ]),
          React.createElement('div', { key: 'btns', style: { display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 } }, [
            React.createElement('button', { key: 'wide', onClick: (e: any) => { e.stopPropagation(); setAudioWide(!audioWide); }, style: { width: 26, height: 26, borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgElevated, color: colors.textSecondary, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, audioWide ? '⊡' : '⛶'),
            React.createElement('button', { key: 'close', onClick: (e: any) => { e.stopPropagation(); setAudioOpen(false); setAudioPos(null); }, style: { width: 26, height: 26, borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgElevated, color: colors.textSecondary, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '✕'),
          ]),
        ]),

        // Google Drive audio preview iframe — plays natively without CORS issues
        React.createElement('iframe', {
          key: 'audio-iframe',
          src: 'https://drive.google.com/file/d/1yEcTiYAp-rPW61fwIJL8JfVH5QMhzby7/preview',
          style: {
            width: '100%',
            height: audioWide ? 100 : 80,
            border: 'none',
            borderRadius: '0 0 16px 16px',
            backgroundColor: colors.bgCard,
          },
          allow: 'autoplay',
          title: 'Deep Work Audio Blueprint',
        }),
      ])}
    </SafeAreaView>
  );
}


// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgBase },
  scroll: { padding: spacing.lg, gap: spacing.lg },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: typography.fontSizeXxl, fontWeight: '700', color: NF_BLUE },
  subtitle: { fontSize: typography.fontSizeSm, color: colors.textSecondary, marginTop: 2 },
  backBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(74,144,226,0.12)', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  todayBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(52, 211, 153, 0.1)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.25)' },
  todayBadgeText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  statsBox: { alignItems: 'flex-end' },
  statsValue: { fontSize: typography.fontSizeXl, fontWeight: '800' },
  statsLabel: { fontSize: typography.fontSizeXs, color: colors.textMuted, fontWeight: '600' },

  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  typeBtnDisabled: { opacity: 0.5 },
  typeBtnEmoji: { fontSize: 14 },
  typeBtnLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  typeBtnDur: { fontSize: 10, fontWeight: '500', textAlign: 'center' },

  // Blueprint hyperlink — centered above orb
  blueprintLink: { alignItems: 'center', paddingVertical: 6 },
  blueprintLinkText: { fontSize: 13, fontWeight: '600', color: NF_BLUE, textDecorationLine: 'underline' },

  // Lotus orb
  orbArea: { height: 280, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5, borderRadius: radius.full },
  ringOuter: { width: 260, height: 260 },
  ringMiddle: { width: 210, height: 210 },
  orbCenter: { width: 160, height: 160, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  orbEmoji: { fontSize: 40 },
  timerDisplay: { fontSize: typography.fontSizeDisplay, fontWeight: '800', letterSpacing: 2 },
  timerLabel: { fontSize: typography.fontSizeXs, color: colors.textMuted, fontWeight: '600', letterSpacing: 0.5 },

  // Controls
  controls: { alignItems: 'center' },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radius.full, minWidth: 180, justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  startBtnText: { fontSize: typography.fontSizeMd, fontWeight: '700', color: '#fff' },
  activeControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stopBtn: { width: 52, height: 52, borderRadius: radius.full, backgroundColor: colors.error + '15', alignItems: 'center', justifyContent: 'center' },
  pauseBtn: { width: 64, height: 64, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },

  // Distraction Parking Lot
  parkingCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 12 },
  parkingHeader: { gap: 4 },
  parkingTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  parkingSubtitle: { fontSize: 11, color: colors.textSecondary },
  parkingInputRow: { flexDirection: 'row', gap: 8 },
  parkingInput: { flex: 1, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: colors.textPrimary },
  parkBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: NF_BLUE, borderRadius: radius.sm, justifyContent: 'center' },
  parkBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  parkEmpty: { fontSize: 12, color: colors.textTertiary, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  parkList: { gap: 6, maxHeight: 200 },
  parkItem: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.bgElevated, borderRadius: radius.sm, padding: 10, gap: 8 },
  parkItemLeft: { flex: 1, gap: 2 },
  parkItemTime: { fontSize: 10, color: NF_BLUE, fontWeight: '600' },
  parkItemText: { fontSize: 12, color: colors.textPrimary },
  parkItemDel: { padding: 4 },

  // Productivity Insights
  insightsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: NF_BLUE + '33', padding: spacing.md, gap: 10 },
  insightsTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  insightsSub: { fontSize: 11, color: colors.textSecondary },
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  insightDot: { width: 10, height: 10, borderRadius: 5 },
  insightLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  insightMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  insightTime: { fontSize: 10, color: colors.textMuted },
  insightSummary: { marginTop: 4, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  insightSummaryText: { fontSize: 12, fontWeight: '600', color: NF_BLUE, textAlign: 'center' },

  // History
  historyCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  historyTitle: { fontSize: typography.fontSizeSm, fontWeight: '800', color: '#34D399', marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.8, textShadowColor: 'rgba(52,211,153,0.55)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  historyScroll: { maxHeight: 280, overflow: 'scroll' as any },
  historyEmpty: { fontSize: typography.fontSizeXs, color: colors.textTertiary, fontStyle: 'italic', textAlign: 'center', paddingVertical: spacing.sm },

  // PDF popup
  pdfOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  pdfSheet: { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, width: '100%', maxWidth: 720, overflow: 'hidden' as any, maxHeight: '90%' as any },
  pdfSheetFull: { maxWidth: '100%' as any, maxHeight: '100%' as any, borderRadius: 0 },
  pdfHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgSecondary },
  pdfHeaderTitle: { fontSize: 14, fontWeight: '700', color: NF_BLUE },
  pdfHeaderBtns: { flexDirection: 'row', gap: 8 },
  pdfHeaderBtn: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  pdfHeaderBtnText: { fontSize: 16, color: colors.textPrimary },

  // Audio PiP player — fixed bottom-right
  audioPlayer: {
    position: 'absolute' as any,
    bottom: 24,
    right: 20,
    width: 300,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: NF_BLUE + '44',
    shadowColor: NF_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden' as any,
  },
  audioPlayerWide: { width: 480, right: 20 },
  audioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  audioHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  audioArtwork: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: NF_BLUE + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: NF_BLUE + '44' },
  audioArtworkEmoji: { fontSize: 20 },
  audioTitle: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  audioArtist: { fontSize: 10, color: NF_BLUE, marginTop: 2 },
  audioHeaderBtns: { flexDirection: 'row', gap: 4 },
  audioIconBtn: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  audioIconBtnText: { fontSize: 13, color: colors.textSecondary },
  audioProgressBar: { height: 3, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  audioProgressFill: { height: 3, backgroundColor: NF_BLUE, borderRadius: 2 },
  audioTimestamps: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm, marginTop: 4 },
  audioTime: { fontSize: 9, color: colors.textTertiary, fontWeight: '600' },
  audioControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: spacing.sm },
  audioControlBtn: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  audioControlIcon: { fontSize: 18 },
  audioPlayBtn: { width: 48, height: 48, borderRadius: radius.full, backgroundColor: NF_BLUE, alignItems: 'center', justifyContent: 'center', shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  audioPlayIcon: { fontSize: 20, color: '#fff' },

  // View All Logs button
  viewLogsBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: NF_BLUE,
    alignItems: 'center',
    shadowColor: NF_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 6,
  },
  viewLogsBtnText: { fontSize: 15, color: '#fff', fontWeight: '700', letterSpacing: 0.3 },
});
