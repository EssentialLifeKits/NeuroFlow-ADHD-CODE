/**
 * NeuroFlow — Session Log (Hidden Page)
 * ─────────────────────────────────────────────────────────────────────────────
 * Full history of all focus sessions across all time.
 * Accessible via "📋 View All Session Logs" on the Focus screen.
 * Not shown in tab bar (href: null in _layout.tsx).
 */

import React, { useState, useCallback } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Trash2, ArrowLeft } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../src/constants/theme';
import { fetchAllSessions, deleteFocusSession, updateSessionNote, type FocusSession, type SessionType } from '../../src/lib/db';
import { useAuth } from '../../src/lib/auth';

const NF_BLUE = '#4A90E2';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MOODS = [
  { emoji: '😞', label: 'Rough' },
  { emoji: '😕', label: 'Meh' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😊', label: 'Great' },
];

const SESSION_META: Record<SessionType, { emoji: string; label: string; color: string }> = {
  focus:       { emoji: '🪷', label: '25m Focus',       color: NF_BLUE },
  short_break: { emoji: '🌿', label: '5m Short Break',  color: colors.success },
  long_break:  { emoji: '🌙', label: '15m Long Break',  color: colors.accentPurple },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function groupByDate(sessions: FocusSession[]): { label: string; sessions: FocusSession[] }[] {
  const map = new Map<string, FocusSession[]>();
  for (const s of sessions) {
    const key = new Date(s.started_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([, items]) => ({
    label: formatDate(items[0].started_at),
    sessions: items,
  }));
}

// ─── Session Row ──────────────────────────────────────────────────────────────
function SessionRow({
  session,
  onDelete,
  onEditNote,
}: {
  session: FocusSession;
  onDelete: (id: string) => void;
  onEditNote: (session: FocusSession) => void;
}) {
  const meta = SESSION_META[session.session_type] ?? SESSION_META.focus;
  const dotColor = session.status === 'completed' ? colors.success : colors.error;
  const mood = session.mood_after ? MOODS[session.mood_after - 1] : null;
  const mins = session.actual_duration_min != null ? session.actual_duration_min : session.planned_duration_min;
  const minLabel = mins > 0 ? `${mins}m` : '<1m';
  const statusLabel = session.status === 'completed' ? 'Completed' : 'Ended early';

  const handleDelete = () => {
    Alert.alert(
      'Delete Session?',
      'This session log will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => onDelete(session.id),
        },
      ],
    );
  };

  return (
    <View style={row.card}>
      {/* Left: status dot + session info */}
      <View style={[row.colorBar, { backgroundColor: meta.color }]} />
      <View style={row.body}>
        <View style={row.topRow}>
          <View style={[row.dot, { backgroundColor: dotColor }]} />
          <Text style={row.sessionLabel}>
            {meta.emoji} {meta.label}
          </Text>
          {mood && <Text style={row.moodEmoji}>{mood.emoji}</Text>}
          <Text style={row.duration}>{minLabel}</Text>
        </View>
        <View style={row.bottomRow}>
          <Text style={row.statusText}>{statusLabel}</Text>
          <Text style={row.timeText}>{formatTime(session.started_at)}</Text>
          {mood && <Text style={row.moodLabel}>{mood.label}</Text>}
        </View>
        {/* Note preview snippet */}
        {session.notes && (
          <Text style={row.notesText}>📝 {session.notes}</Text>
        )}
        {/* Note action button */}
        <TouchableOpacity onPress={() => onEditNote(session)} activeOpacity={0.7} style={row.noteBtn}>
          <Text style={session.notes ? row.noteBtnTextHas : row.noteBtnTextAdd}>
            {session.notes ? '📝 View Note' : '+ Add note'}
          </Text>
        </TouchableOpacity>
      </View>
      {/* Delete button */}
      <TouchableOpacity onPress={handleDelete} style={row.deleteBtn} activeOpacity={0.7}>
        <Trash2 size={15} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

const row = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  colorBar: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sessionLabel: { flex: 1, fontSize: typography.fontSizeSm, fontWeight: '600', color: colors.textPrimary },
  moodEmoji: { fontSize: 16 },
  duration: { fontSize: typography.fontSizeXs, color: colors.textMuted, fontWeight: '600' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: typography.fontSizeXs, color: colors.textTertiary },
  timeText: { fontSize: typography.fontSizeXs, color: colors.textTertiary },
  moodLabel: { fontSize: typography.fontSizeXs, color: NF_BLUE, fontWeight: '600' },
  notesText: { fontSize: typography.fontSizeXs, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  noteBtn: { alignSelf: 'flex-start', marginTop: 3, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: NF_BLUE + '55', backgroundColor: NF_BLUE + '12' },
  noteBtnTextHas: { fontSize: 10, fontWeight: '700', color: NF_BLUE },
  noteBtnTextAdd: { fontSize: 10, fontWeight: '600', color: colors.textTertiary },
  deleteBtn: {
    padding: spacing.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SessionLogScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingNoteSession, setEditingNoteSession] = useState<FocusSession | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const data = await fetchAllSessions(user.id);
      setSessions(data);
    } catch {
      // fail silently — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  // Reload every time the screen comes into focus
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const handleRefresh = () => { setRefreshing(true); load(); };

  const handleDelete = async (sessionId: string) => {
    // Optimistic removal
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    try {
      await deleteFocusSession(sessionId);
    } catch {
      // Re-fetch on failure to restore accurate state
      load();
    }
  };

  const handleEditNote = (sess: FocusSession) => {
    setEditingNoteSession(sess);
    setEditNoteText(sess.notes ?? '');
  };

  const handleSaveEditedNote = async (notes: string | null) => {
    const sess = editingNoteSession;
    setEditingNoteSession(null);
    setEditNoteText('');
    if (!sess) return;
    try {
      await updateSessionNote(sess.id, notes);
      setSessions((prev) => prev.map((s) => s.id === sess.id ? { ...s, notes: notes ?? null } : s));
    } catch {
      load();
    }
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalFocus = sessions.filter((s) => s.session_type === 'focus' && s.status === 'completed');
  const totalMin = totalFocus.reduce((sum, s) => sum + (s.actual_duration_min ?? 0), 0);
  const moodedSessions = sessions.filter((s) => s.mood_after != null);
  const avgMood = moodedSessions.length
    ? Math.round(moodedSessions.reduce((sum, s) => sum + (s.mood_after ?? 0), 0) / moodedSessions.length)
    : null;
  const avgMoodEmoji = avgMood ? MOODS[avgMood - 1]?.emoji : null;

  const groups = groupByDate(sessions);

  return (
    <SafeAreaView style={s.safe}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>Session Logs</Text>
          <Text style={s.subtitle}>Your full focus history</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(app)/calendar')} style={s.calBtn} activeOpacity={0.7}>
          <Text style={s.calBtnText}>📅 Calendar</Text>
        </TouchableOpacity>
      </View>

      {/* ── Summary Stats ── */}
      {sessions.length > 0 && (
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: NF_BLUE }]}>{sessions.length}</Text>
            <Text style={s.statLabel}>Total Sessions</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: colors.success }]}>{totalMin}m</Text>
            <Text style={s.statLabel}>Focus Time</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: '#F59E0B' }]}>
              {avgMoodEmoji ?? '—'}
            </Text>
            <Text style={s.statLabel}>Avg Mood</Text>
          </View>
        </View>
      )}

      {/* ── List ── */}
      <View style={{ flex: 1 }}>
      {loading ? (
        <View style={s.centerState}>
          <ActivityIndicator color={NF_BLUE} size="large" />
        </View>
      ) : sessions.length === 0 ? (
        <View style={s.centerState}>
          <Text style={s.emptyEmoji}>🪷</Text>
          <Text style={s.emptyTitle}>No sessions logged yet</Text>
          <Text style={s.emptySubtitle}>Start your first focus session to see your history here.</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.goFocusBtn} activeOpacity={0.8}>
            <Text style={s.goFocusBtnText}>Go to Focus Timer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={NF_BLUE}
              colors={[NF_BLUE]}
            />
          }
        >
          {groups.map((group) => (
            <View key={group.label}>
              <Text style={s.dateHeader}>{group.label}</Text>
              {group.sessions.map((sess) => (
                <SessionRow key={sess.id} session={sess} onDelete={handleDelete} onEditNote={handleEditNote} />
              ))}
            </View>
          ))}
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      )}
      </View>

      {/* ── Note Edit Modal ── */}
      <Modal visible={!!editingNoteSession} transparent animationType="fade" onRequestClose={() => setEditingNoteSession(null)}>
        <View style={s.noteOverlay}>
          <View style={s.noteSheet}>
            <Text style={s.noteEmoji}>📝</Text>
            <Text style={s.noteTitle}>Session Note</Text>
            <Text style={s.noteSub}>Edit or delete your note for this session</Text>
            <TextInput
              style={s.noteInput}
              multiline
              numberOfLines={4}
              placeholder="Jot down any thoughts from this session..."
              placeholderTextColor={colors.textTertiary}
              value={editNoteText}
              onChangeText={setEditNoteText}
              textAlignVertical="top"
              autoFocus
            />
            <View style={s.noteBtnRow}>
              <TouchableOpacity
                onPress={() => handleSaveEditedNote(null)}
                style={s.noteDeleteBtn}
                activeOpacity={0.75}
              >
                <Text style={s.noteDeleteText}>🗑 Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSaveEditedNote(editNoteText.trim() || null)}
                style={s.noteSaveBtn}
                activeOpacity={0.85}
              >
                <Text style={s.noteSaveText}>💾 Save</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setEditingNoteSession(null)} activeOpacity={0.7} style={{ alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontSize: typography.fontSizeXs, color: colors.textTertiary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgBase },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  calBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: NF_BLUE + '55' },
  calBtnText: { fontSize: 11, fontWeight: '700', color: NF_BLUE },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: typography.fontSizeLg, fontWeight: '700', color: NF_BLUE },
  subtitle: { fontSize: typography.fontSizeXs, color: colors.textSecondary, marginTop: 2 },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: typography.fontSizeXl, fontWeight: '800' },
  statLabel: { fontSize: typography.fontSizeXs, color: colors.textTertiary, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md },

  dateHeader: {
    fontSize: typography.fontSizeXs,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },

  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: typography.fontSizeLg, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: typography.fontSizeSm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  goFocusBtn: { marginTop: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, backgroundColor: NF_BLUE, borderRadius: radius.full },
  goFocusBtnText: { fontSize: typography.fontSizeSm, fontWeight: '700', color: '#fff' },

  // Note edit modal
  noteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  noteSheet: { backgroundColor: colors.bgCard, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 480, gap: spacing.md },
  noteEmoji: { fontSize: 36, textAlign: 'center' },
  noteTitle: { fontSize: typography.fontSizeXl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  noteSub: { fontSize: typography.fontSizeSm, color: colors.textSecondary, textAlign: 'center' },
  noteInput: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.fontSizeSm,
    color: colors.textPrimary,
    minHeight: 100,
  },
  noteBtnRow: { flexDirection: 'row', gap: spacing.sm },
  noteDeleteBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error + '55', alignItems: 'center' },
  noteDeleteText: { fontSize: typography.fontSizeSm, color: colors.error, fontWeight: '600' },
  noteSaveBtn: { flex: 2, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: NF_BLUE, alignItems: 'center' },
  noteSaveText: { fontSize: typography.fontSizeSm, color: '#fff', fontWeight: '700' },
});
