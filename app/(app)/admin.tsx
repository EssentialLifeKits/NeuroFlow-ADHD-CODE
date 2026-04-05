/**
 * NeuroFlow — Admin Portal
 * Hidden screen accessible only to essentiallifekits@gmail.com
 * Navigate to via router.push('/(app)/admin') — not shown in tab bar
 *
 * Sections:
 *   1. Email Config  — from_email, subject templates
 *   2. Resources     — add / edit / delete resource cards
 *   3. App Settings  — blueprint link, audio link
 *   4. User Monitor  — view all registered users
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import {
  fetchAllResourceCards,
  createResourceCard,
  updateResourceCard,
  deleteResourceCard,
  getAllSettings,
  setSetting,
  type ResourceCard,
} from '../../src/lib/adminDb';
import { insforge } from '../../src/lib/insforge';
import { colors, radius, spacing, typography } from '../../src/constants/theme';

const NF_BLUE    = '#4A90E2';
const NF_RED     = '#F87171';
const NF_GREEN   = '#34D399';
const NF_ORANGE  = '#FB923C';
const ADMIN_EMAIL = 'essentiallifekits@gmail.com';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle && <Text style={s.sectionSub}>{subtitle}</Text>}
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[s.card, style]}>{children}</View>;
}

function Btn({
  label, onPress, color = NF_BLUE, outline = false, small = false, disabled = false,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  outline?: boolean;
  small?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        s.btn,
        small && s.btnSmall,
        outline
          ? { borderWidth: 1, borderColor: color, backgroundColor: 'transparent' }
          : { backgroundColor: color },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[s.btnText, small && s.btnTextSmall, outline && { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label, value, onChangeText, placeholder, multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ''}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

// ─── Email Config Section ────────────────────────────────────────────────────

function EmailConfigSection({
  settings, onSave,
}: {
  settings: Record<string, string>;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [fromEmail, setFromEmail]       = useState(settings['from_email'] ?? '');
  const [subjectTask, setSubjectTask]   = useState(settings['email_subject_task'] ?? '');
  const [subjectRem, setSubjectRem]     = useState(settings['email_subject_reminder'] ?? '');
  const [saving, setSaving]             = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('from_email', fromEmail),
        onSave('email_subject_task', subjectTask),
        onSave('email_subject_reminder', subjectRem),
      ]);
      Alert.alert('Saved', 'Email config updated.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="✉️ Email Configuration" subtitle="Controls how reminder emails are sent via Resend" />
      <Field label="From Email" value={fromEmail} onChangeText={setFromEmail} placeholder="NeuroFlow <reminders@keepzbrandai.com>" />
      <Field label="At-Time Subject (use {{title}})" value={subjectTask} onChangeText={setSubjectTask} placeholder="🎯 Now: {{title}}" />
      <Field label="Reminder Subject (use {{title}})" value={subjectRem} onChangeText={setSubjectRem} placeholder="⏰ Reminder: {{title}}" />
      <Btn label={saving ? 'Saving…' : 'Save Email Config'} onPress={save} disabled={saving} />
    </Card>
  );
}

// ─── App Settings Section ────────────────────────────────────────────────────

function AppSettingsSection({
  settings, onSave,
}: {
  settings: Record<string, string>;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [blueprint, setBlueprint] = useState(settings['blueprint_link'] ?? '');
  const [audio, setAudio]         = useState(settings['audio_link'] ?? '');
  const [saving, setSaving]       = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('blueprint_link', blueprint),
        onSave('audio_link', audio),
      ]);
      Alert.alert('Saved', 'App settings updated.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="⚙️ App Settings" subtitle="Links and content shown inside the app" />
      <Field label="Deep Work Blueprint Link" value={blueprint} onChangeText={setBlueprint} placeholder="https://…" />
      <Field label="Audio Player Link (Focus page)" value={audio} onChangeText={setAudio} placeholder="https://…" />
      <Btn label={saving ? 'Saving…' : 'Save App Settings'} onPress={save} disabled={saving} />
    </Card>
  );
}

// ─── Resource Card Editor ────────────────────────────────────────────────────

type CardDraft = Omit<ResourceCard, 'id' | 'created_at' | 'updated_at'>;

const BLANK_CARD: CardDraft = {
  title: '', description: '', icon: '📘',
  icon_bg: 'rgba(74,144,226,0.12)', accent_color: '#4A90E2',
  link: '#', link_label: 'Learn More →',
  sort_order: 0, is_active: true,
};

function ResourceCardEditor({
  initial, onSave, onCancel,
}: {
  initial: CardDraft;
  onSave: (draft: CardDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CardDraft>({ ...initial });
  const [saving, setSaving] = useState(false);

  function set(key: keyof CardDraft, value: any) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!draft.title.trim()) { Alert.alert('Validation', 'Title is required.'); return; }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={s.editorWrap}>
      <Field label="Title *"        value={draft.title}       onChangeText={v => set('title', v)}       placeholder="Deep Work Blueprint" />
      <Field label="Description *"  value={draft.description} onChangeText={v => set('description', v)} placeholder="Short description…" multiline />
      <Field label="Icon (emoji)"   value={draft.icon}        onChangeText={v => set('icon', v)}        placeholder="📘" />
      <Field label="Icon Background" value={draft.icon_bg}   onChangeText={v => set('icon_bg', v)}     placeholder="rgba(74,144,226,0.12)" />
      <Field label="Accent Color"   value={draft.accent_color} onChangeText={v => set('accent_color', v)} placeholder="#4A90E2" />
      <Field label="Link URL"       value={draft.link}        onChangeText={v => set('link', v)}        placeholder="https://…" />
      <Field label="Link Label"     value={draft.link_label}  onChangeText={v => set('link_label', v)}  placeholder="Learn More →" />
      <Field label="Sort Order"     value={String(draft.sort_order)} onChangeText={v => set('sort_order', parseInt(v) || 0)} placeholder="0" />
      <View style={s.toggleRow}>
        <Text style={s.fieldLabel}>Active (visible to users)</Text>
        <Switch
          value={draft.is_active}
          onValueChange={v => set('is_active', v)}
          trackColor={{ false: colors.border, true: NF_BLUE }}
          thumbColor="#fff"
        />
      </View>
      <View style={s.rowGap}>
        <Btn label={saving ? 'Saving…' : 'Save Card'} onPress={handleSave} disabled={saving} />
        <Btn label="Cancel" onPress={onCancel} outline color={colors.textSecondary} />
      </View>
    </View>
  );
}

// ─── Resources Manager Section ───────────────────────────────────────────────

function ResourcesSection() {
  const [cards, setCards]         = useState<ResourceCard[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState<ResourceCard | null | 'new'>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCards(await fetchAllResourceCards()); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(draft: CardDraft) {
    await createResourceCard(draft);
    setEditing(null);
    await load();
    Alert.alert('Created', 'Resource card added.');
  }

  async function handleUpdate(id: string, draft: CardDraft) {
    await updateResourceCard(id, draft);
    setEditing(null);
    await load();
    Alert.alert('Updated', 'Resource card saved.');
  }

  async function handleDelete(card: ResourceCard) {
    Alert.alert(
      'Delete Card',
      `Delete "${card.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteResourceCard(card.id);
            await load();
          },
        },
      ],
    );
  }

  return (
    <Card>
      <SectionHeader title="🗂 Resources Manager" subtitle="Add, edit, or remove cards shown on the Resources page" />

      {loading && <ActivityIndicator color={NF_BLUE} style={{ marginVertical: 12 }} />}

      {!loading && editing === null && (
        <>
          {cards.map(card => (
            <View key={card.id} style={s.resourceRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.resourceTitle}>
                  {card.icon} {card.title}
                  {!card.is_active && <Text style={s.inactiveTag}> · hidden</Text>}
                </Text>
                <Text style={s.resourceDesc} numberOfLines={1}>{card.description}</Text>
              </View>
              <View style={s.resourceActions}>
                <Btn label="Edit"   onPress={() => setEditing(card)} small outline color={NF_BLUE} />
                <Btn label="Delete" onPress={() => handleDelete(card)} small outline color={NF_RED} />
              </View>
            </View>
          ))}
          <Btn label="+ Add New Card" onPress={() => setEditing('new')} color={NF_GREEN} />
        </>
      )}

      {!loading && editing === 'new' && (
        <ResourceCardEditor
          initial={{ ...BLANK_CARD, sort_order: cards.length }}
          onSave={handleCreate}
          onCancel={() => setEditing(null)}
        />
      )}

      {!loading && editing !== null && editing !== 'new' && (
        <ResourceCardEditor
          initial={{
            title: editing.title, description: editing.description,
            icon: editing.icon, icon_bg: editing.icon_bg,
            accent_color: editing.accent_color, link: editing.link,
            link_label: editing.link_label, sort_order: editing.sort_order,
            is_active: editing.is_active,
          }}
          onSave={(draft) => handleUpdate((editing as ResourceCard).id, draft)}
          onCancel={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

// ─── User Monitor Section ────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  display_name?: string;
  created_at: string;
  onboarded?: boolean;
}

function UserMonitorSection() {
  const [users, setUsers]     = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await insforge.database
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        setUsers((data ?? []) as UserRow[]);
      } catch (e: any) {
        Alert.alert('Error loading users', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card>
      <SectionHeader
        title={`👥 User Monitor (${users.length})`}
        subtitle="All registered NeuroFlow accounts"
      />
      {loading && <ActivityIndicator color={NF_BLUE} style={{ marginVertical: 12 }} />}
      {!loading && users.length === 0 && (
        <Text style={s.emptyText}>No users found.</Text>
      )}
      {!loading && users.map(u => (
        <View key={u.id} style={s.userRow}>
          <View style={s.userAvatar}>
            <Text style={s.userAvatarText}>{(u.display_name ?? u.email)?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{u.display_name ?? '—'}</Text>
            <Text style={s.userEmail}>{u.email}</Text>
          </View>
          <View style={s.userMeta}>
            <Text style={[s.userBadge, u.onboarded ? s.badgeGreen : s.badgeGray]}>
              {u.onboarded ? 'Active' : 'Pending'}
            </Text>
            <Text style={s.userDate}>
              {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

// ─── Admin Portal Screen ─────────────────────────────────────────────────────

export default function AdminScreen() {
  const { user } = useAuth();
  const router   = useRouter();
  const [settings, setSettings]   = useState<Record<string, string>>({});
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Gate: only admin email allowed
  const userEmail = (user as any)?.email ?? '';
  const isAdmin   = userEmail === ADMIN_EMAIL || userEmail === 'dev@neuroflow.app';

  useEffect(() => {
    if (!isAdmin) return;
    getAllSettings().then(s => { setSettings(s); setLoadingSettings(false); });
  }, [isAdmin]);

  async function handleSaveSetting(key: string, value: string) {
    await setSetting(key, value);
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centerWrap}>
          <Text style={s.lockIcon}>🔒</Text>
          <Text style={s.lockTitle}>Admin Access Required</Text>
          <Text style={s.lockSub}>This area is restricted to authorised administrators.</Text>
          <Btn label="← Go Back" onPress={() => router.back()} outline color={NF_BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>Admin Portal</Text>
            <Text style={s.pageSub}>NeuroFlow backend controls</Text>
          </View>
          <View style={s.adminBadge}>
            <Text style={s.adminBadgeText}>🛡️ Admin</Text>
          </View>
        </View>

        {loadingSettings ? (
          <ActivityIndicator color={NF_BLUE} style={{ marginTop: 40 }} />
        ) : (
          <>
            <EmailConfigSection settings={settings} onSave={handleSaveSetting} />
            <AppSettingsSection settings={settings} onSave={handleSaveSetting} />
            <ResourcesSection />
            <UserMonitorSection />
          </>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bgBase },
  scroll: { padding: spacing.lg, gap: spacing.lg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(74,144,226,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  backBtnText:  { fontSize: 22, color: NF_BLUE, lineHeight: 28, fontWeight: '600' },
  pageTitle:    { fontSize: 22, fontWeight: '800', color: NF_BLUE, letterSpacing: -0.5 },
  pageSub:      { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  adminBadge:   { backgroundColor: 'rgba(74,144,226,0.12)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: NF_BLUE + '44' },
  adminBadgeText: { fontSize: 12, fontWeight: '700', color: NF_BLUE },

  // Card
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
    gap: spacing.md,
  },

  // Section header
  sectionHeader: { marginBottom: 4 },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  sectionSub:    { fontSize: 12, color: colors.textSecondary, marginTop: 3 },

  // Field
  fieldWrap:   { gap: 6 },
  fieldLabel:  { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: colors.textPrimary,
  },
  inputMulti:  { minHeight: 72, textAlignVertical: 'top' },

  // Button
  btn:         { borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  btnSmall:    { paddingHorizontal: 10, paddingVertical: 6 },
  btnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnTextSmall: { fontSize: 12 },

  // Toggle row
  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // Row gap helper
  rowGap: { flexDirection: 'row', gap: 8 },

  // Resource rows
  resourceRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  resourceTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  resourceDesc:  { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  inactiveTag:   { color: NF_ORANGE, fontWeight: '600' },
  resourceActions: { flexDirection: 'row', gap: 6 },
  editorWrap:    { gap: spacing.md, paddingTop: 4 },

  // User monitor
  userRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  userAvatar:   { width: 36, height: 36, borderRadius: 18, backgroundColor: NF_BLUE + '22', justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { fontSize: 15, fontWeight: '800', color: NF_BLUE },
  userName:     { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  userEmail:    { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  userMeta:     { alignItems: 'flex-end', gap: 4 },
  userBadge:    { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  badgeGreen:   { backgroundColor: NF_GREEN + '22', color: NF_GREEN },
  badgeGray:    { backgroundColor: colors.border, color: colors.textTertiary },
  userDate:     { fontSize: 10, color: colors.textTertiary },

  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: 8 },

  // Access denied
  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: 12 },
  lockIcon:   { fontSize: 48 },
  lockTitle:  { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  lockSub:    { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
