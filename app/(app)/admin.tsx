/**
 * NeuroFlow — Admin Portal
 * Hidden screen — only essentiallifekits@gmail.com can access.
 *
 * Sections:
 *   1. Email Template Editor  — live preview + full color/content editing
 *   2. Resources Manager      — visual card previews with inline editing
 *   3. App Settings           — blueprint link, audio link
 *   4. User Monitor           — scrollable list, green glow for active users
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Switch,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../src/lib/auth';
import {
  fetchAllResourceCards,
  createResourceCard,
  updateResourceCard,
  deleteResourceCard,
  uploadResourceFile,
  getAllSettings,
  setSetting,
  type ResourceCard,
} from '../../src/lib/adminDb';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, spacing } from '../../src/constants/theme';

const NF_BLUE   = '#4A90E2';
const NF_RED    = '#F87171';
const NF_GREEN  = '#34D399';
const NF_ORANGE = '#FB923C';
const ADMIN_EMAIL = 'essentiallifekits@gmail.com';

// ─── Shared primitives ────────────────────────────────────────────────────────

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
  label: string; onPress: () => void; color?: string;
  outline?: boolean; small?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      style={[
        s.btn, small && s.btnSmall,
        outline ? { borderWidth: 1, borderColor: color, backgroundColor: 'transparent' } : { backgroundColor: color },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[s.btnText, small && s.btnTextSmall, outline && { color }]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label, value, onChangeText, placeholder, multiline = false,
}: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; multiline?: boolean;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.inputMulti]}
        value={value} onChangeText={onChangeText}
        placeholder={placeholder ?? ''} placeholderTextColor={colors.textTertiary}
        multiline={multiline} numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: color, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }} />
      <Text style={{ fontSize: 9, color: colors.textTertiary }}>{label}</Text>
    </View>
  );
}

// ─── Email Template Editor ────────────────────────────────────────────────────

function EmailTemplateSection({
  settings, onSave,
}: {
  settings: Record<string, string>;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [fromEmail,    setFromEmail]    = useState(settings['from_email'] ?? '');
  const [subjectTask,  setSubjectTask]  = useState(settings['email_subject_task'] ?? '🎯 Now: {{title}}');
  const [subjectRem,   setSubjectRem]   = useState(settings['email_subject_reminder'] ?? '⏰ Reminder: {{title}}');
  const [headerColor,  setHeaderColor]  = useState(settings['email_header_color'] ?? '#4A90E2');
  const [accentColor,  setAccentColor]  = useState(settings['email_accent_color'] ?? '#4A90E2');
  const [footerText,   setFooterText]   = useState(settings['email_footer_text'] ?? 'Sent by NeuroFlow · ADHD Focus Planner · Built for your brain ✨');
  const [previewOpen,  setPreviewOpen]  = useState(false);
  const [saving, setSaving]            = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('from_email', fromEmail),
        onSave('email_subject_task', subjectTask),
        onSave('email_subject_reminder', subjectRem),
        onSave('email_header_color', headerColor),
        onSave('email_accent_color', accentColor),
        onSave('email_footer_text', footerText),
      ]);
      Alert.alert('Saved', 'Email template config updated.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="✉️ Email Template Editor" subtitle="Edit content, colors, and preview the live template" />

      {/* Color swatches row */}
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <ColorSwatch color={headerColor} label="Header" />
        <ColorSwatch color={accentColor} label="Accent" />
        <View style={{ flex: 1 }} />
        <Btn label="👁 Preview Email" onPress={() => setPreviewOpen(true)} outline color={NF_BLUE} small />
      </View>

      <Field label="From Email Address" value={fromEmail} onChangeText={setFromEmail} placeholder="NeuroFlow <reminders@keepzbrandai.com>" />
      <Field label="At-Time Subject  (use {{title}})" value={subjectTask} onChangeText={setSubjectTask} />
      <Field label="Reminder Subject  (use {{title}})" value={subjectRem} onChangeText={setSubjectRem} />
      <Field label="Header / Brand Color (hex)" value={headerColor} onChangeText={setHeaderColor} placeholder="#4A90E2" />
      <Field label="Accent / Card Border Color (hex)" value={accentColor} onChangeText={setAccentColor} placeholder="#4A90E2" />
      <Field label="Footer Text" value={footerText} onChangeText={setFooterText} multiline />

      <Btn label={saving ? 'Saving…' : '💾 Save Email Config'} onPress={save} disabled={saving} />

      {/* Live Preview Modal */}
      <Modal visible={previewOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPreviewOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#0e0e1a' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>📧 Email Preview</Text>
            <Pressable onPress={() => setPreviewOpen(false)} style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: colors.bgCard, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>✕ Close</Text>
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 12, textAlign: 'center' }}>
              Live preview — reflects your current color + content settings
            </Text>
            {/* Render the HTML preview as styled boxes since iframe isn't available natively */}
            <View style={{ backgroundColor: '#15152a', borderRadius: 20, borderWidth: 1, borderColor: '#2a2a3e', overflow: 'hidden' }}>
              {/* Header bar */}
              <View style={{ backgroundColor: '#1a1a2e', padding: 20, borderBottomWidth: 1, borderBottomColor: '#2a2a3e', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: headerColor }}>NeuroFlow <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '400' }}>Focus Planner</Text></Text>
                <View style={{ backgroundColor: accentColor + '22', borderWidth: 1, borderColor: accentColor + '55', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ color: accentColor, fontSize: 10, fontWeight: '700' }}>✅ TASK</Text>
                </View>
              </View>
              {/* Body */}
              <View style={{ padding: 24 }}>
                <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 6 }}>Hi there 👋</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#f0f0f5', marginBottom: 4 }}>🎯 It's time: <Text style={{ fontWeight: '800' }}>Your Task Title</Text></Text>
                <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>Your scheduled task is happening now.</Text>
                {/* Card block */}
                <View style={{ backgroundColor: '#1e1e35', borderWidth: 1, borderColor: accentColor + '44', borderLeftWidth: 4, borderLeftColor: accentColor, borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#f0f0f5', marginBottom: 10 }}>✅ Your Task Title</Text>
                  <View style={{ flexDirection: 'row', gap: 24 }}>
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' }}>DATE</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#e5e7eb', marginTop: 3 }}>📅 Saturday, April 5, 2026</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' }}>TIME</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#e5e7eb', marginTop: 3 }}>🕐 9:00 AM</Text>
                    </View>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#9ca3af', lineHeight: 20 }}>Open NeuroFlow and stay in your flow state. You've got this! 🌸</Text>
              </View>
              {/* Footer */}
              <View style={{ backgroundColor: '#0e0e1a', padding: 16, borderTopWidth: 1, borderTopColor: '#2a2a3e' }}>
                <Text style={{ fontSize: 10, color: '#4b5563', textAlign: 'center' }}>{footerText}</Text>
              </View>
            </View>

            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 16, textAlign: 'center', lineHeight: 18 }}>
              Subject (at-time): {subjectTask.replace('{{title}}', 'Your Task Title')}{'\n'}
              Subject (reminder): {subjectRem.replace('{{title}}', 'Your Task Title')}
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </Card>
  );
}

// ─── App Settings ─────────────────────────────────────────────────────────────

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
      await Promise.all([onSave('blueprint_link', blueprint), onSave('audio_link', audio)]);
      Alert.alert('Saved', 'App settings updated.');
    } finally { setSaving(false); }
  }

  return (
    <Card>
      <SectionHeader title="⚙️ App Settings" subtitle="Links displayed inside the app" />
      <Field label="Deep Work Blueprint Link" value={blueprint} onChangeText={setBlueprint} placeholder="https://…" />
      <Field label="Audio Player Link (Focus page)" value={audio} onChangeText={setAudio} placeholder="https://…" />
      <Btn label={saving ? 'Saving…' : '💾 Save Settings'} onPress={save} disabled={saving} />
    </Card>
  );
}

// ─── How To Video Editor ──────────────────────────────────────────────────────

function HowToVideoSection({
  settings, onSave,
}: {
  settings: Record<string, string>;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [videoUrl,       setVideoUrl]       = useState(settings['howto_video_url']   ?? '');
  const [title,          setTitle]          = useState(settings['howto_video_title']  ?? 'How To Use NeuroFlow');
  const [desc,           setDesc]           = useState(settings['howto_video_desc']   ?? 'Watch this short explainer to get the most out of your ADHD toolkit.');
  const [saving,         setSaving]         = useState(false);
  const [preview,        setPreview]        = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const { width } = useWindowDimensions();

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('howto_video_url',   videoUrl),
        onSave('howto_video_title', title),
        onSave('howto_video_desc',  desc),
      ]);
      Alert.alert('Saved', 'How To video card updated.');
    } finally { setSaving(false); }
  }

  async function pickHowToVideo() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['video/mp4', 'video/quicktime', 'video/webm', 'video/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingVideo(true);
      const url = await uploadResourceFile(
        { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'video/mp4', file: (asset as any).file },
        'videos',
      );
      setVideoUrl(url);
      Alert.alert('Uploaded', 'Video uploaded successfully. Tap Save to apply.');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally { setUploadingVideo(false); }
  }

  const isUploadedVideo = videoUrl && (
    videoUrl.toLowerCase().includes('.mp4') ||
    videoUrl.toLowerCase().includes('.mov') ||
    videoUrl.toLowerCase().includes('.webm')
  );

  return (
    <Card>
      <SectionHeader
        title="🎬 How To Video Card"
        subtitle="Shown as an inline player on the Dashboard — not downloadable by users"
      />
      <Field label="Video Title" value={title} onChangeText={setTitle} placeholder="How To Use NeuroFlow" />
      <Field label="Short Description" value={desc} onChangeText={setDesc} multiline placeholder="Describe what the video covers…" />

      {/* Upload from computer */}
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>UPLOAD VIDEO FILE (MP4 / MOV)</Text>
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 8 }}>
          Upload directly from your computer. Supported: MP4, MOV, WebM.
        </Text>
        {isUploadedVideo ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <View style={{ flex: 1, backgroundColor: NF_GREEN + '18', borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 12, color: NF_GREEN, fontWeight: '700' }}>✅ Video file uploaded</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>{videoUrl}</Text>
            </View>
            <Pressable onPress={pickHowToVideo} disabled={uploadingVideo} style={[inlineStyles.deckViewBtn, { paddingVertical: 8 }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: NF_ORANGE }}>Replace</Text>
            </Pressable>
            <Pressable onPress={() => setVideoUrl('')} style={[inlineStyles.deckViewBtn, { paddingVertical: 8 }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: NF_RED }}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickHowToVideo} disabled={uploadingVideo} style={inlineStyles.deckUploadBtn}>
            {uploadingVideo
              ? <ActivityIndicator size="small" color={NF_BLUE} />
              : <>
                  <Text style={{ fontSize: 18 }}>🎬</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: NF_BLUE }}>Upload Video from Computer</Text>
                </>
            }
          </Pressable>
        )}
      </View>

      {/* OR paste embed URL */}
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>— OR PASTE VIDEO URL / EMBED LINK —</Text>
        <TextInput
          style={s.input}
          value={videoUrl}
          onChangeText={setVideoUrl}
          placeholder="https://www.youtube.com/embed/…  or  direct .mp4 link"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
          YouTube embed URL, Vimeo, NotebookLM, or any direct video link.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Btn label="👁 Preview Card" onPress={() => setPreview(true)} outline color={NF_BLUE} small />
        <Btn label={saving ? 'Saving…' : '💾 Save Video Card'} onPress={save} disabled={saving} />
      </View>

      {/* Preview Modal */}
      <Modal visible={preview} transparent animationType="fade" onRequestClose={() => setPreview(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={() => setPreview(false)}>
          <Pressable style={{ backgroundColor: colors.bgCard, borderRadius: 20, padding: 20, width: '100%', maxWidth: 540, gap: 14, borderWidth: 1, borderColor: NF_BLUE + '44' }} onPress={e => e.stopPropagation()}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: NF_BLUE, flex: 1 }}>{title || 'Untitled'}</Text>
              <Pressable onPress={() => setPreview(false)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '700' }}>✕</Text>
              </Pressable>
            </View>
            {desc ? <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>{desc}</Text> : null}
            {videoUrl ? (
              <View style={{ width: '100%', height: Math.min(width * 0.5, 260), borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' }}>
                {isUploadedVideo
                  ? React.createElement('video', {
                      src: videoUrl, controls: true, autoPlay: false,
                      style: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: '#000', outline: 'none' },
                    })
                  : React.createElement('iframe', {
                      src: videoUrl, style: { width: '100%', height: '100%', border: 'none' },
                      title: 'Video Preview', allow: 'autoplay; fullscreen',
                    })
                }
              </View>
            ) : (
              <View style={{ paddingVertical: 24, alignItems: 'center', backgroundColor: colors.bgBase, borderRadius: 12 }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>🎬 No video set yet</Text>
              </View>
            )}
            <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }}>This is exactly how it looks on the Dashboard</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}

// ─── Default cards — mirror of resources.tsx DEFAULT_RESOURCES ───────────────
// Used as fallback when DB resource_cards table is empty, so the preview always
// shows the 6 real cards exactly as users see them.

const DEFAULT_RESOURCE_CARDS: ResourceCard[] = [
  { id: 'default-1', sort_order: 0, is_active: true, created_at: '', updated_at: '', slide_deck_url: null, icon_image_url: null,
    title: 'Deep Work Blueprint', description: 'Science-backed protocols for ADHD deep focus — no willpower required.',
    icon: '📘', icon_bg: NF_BLUE + '18', accent_color: NF_BLUE, link: '#', link_label: 'Open Resource →' },
  { id: 'default-2', sort_order: 1, is_active: true, created_at: '', updated_at: '', slide_deck_url: null, icon_image_url: null,
    title: 'Focus Timer Templates', description: 'Pre-built Pomodoro + body-doubling schedules tuned for ADHD brains.',
    icon: '⏱', icon_bg: 'rgba(52,211,153,0.12)', accent_color: '#34D399', link: '#', link_label: 'Open Resource →' },
  { id: 'default-3', sort_order: 2, is_active: true, created_at: '', updated_at: '', slide_deck_url: null, icon_image_url: null,
    title: 'Task Batching System', description: 'Group your tasks into energy-matched batches so decisions are eliminated.',
    icon: '📋', icon_bg: 'rgba(251,146,60,0.12)', accent_color: '#FB923C', link: '#', link_label: 'Open Resource →' },
  { id: 'default-4', sort_order: 3, is_active: true, created_at: '', updated_at: '', slide_deck_url: null, icon_image_url: null,
    title: 'ADHD Habit Stacker', description: 'Anchor new routines to existing ones — build habits without constant reminders.',
    icon: '🔗', icon_bg: 'rgba(248,113,113,0.12)', accent_color: '#F87171', link: '#', link_label: 'Open Resource →' },
  { id: 'default-5', sort_order: 4, is_active: true, created_at: '', updated_at: '', slide_deck_url: null, icon_image_url: null,
    title: 'Brain Dump Toolkit', description: 'Capture every thought, idea, and obligation into a trusted external system.',
    icon: '🧠', icon_bg: NF_BLUE + '14', accent_color: NF_BLUE, link: '#', link_label: 'Open Resource →' },
  { id: 'default-6', sort_order: 5, is_active: true, created_at: '', updated_at: '', slide_deck_url: null, icon_image_url: null,
    title: 'Productivity Analytics', description: 'Track focus streaks, energy patterns, and see your real daily output.',
    icon: '📊', icon_bg: 'rgba(96,165,250,0.12)', accent_color: '#60A5FA', link: '#', link_label: 'Open Resource →' },
];

// ─── Full user-facing resource card (exact match to resources.tsx) ────────────

function LiveResourceCard({ card, cardWidth }: { card: ResourceCard; cardWidth: any }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const hoverAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const borderColor  = hoverAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.border, NF_BLUE] });
  const shadowOpacity = hoverAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }], width: cardWidth }}>
      <Pressable
        onHoverIn={() => Animated.timing(hoverAnim, { toValue: 1, duration: 250, useNativeDriver: false }).start()}
        onHoverOut={() => Animated.timing(hoverAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start()}
        onPress={() => { if (card.link !== '#') Linking.openURL(card.link); }}
        style={{ flex: 1, width: '100%' }}
      >
        <Animated.View style={[
          liveCardStyles.card,
          { borderColor, shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 0 }, shadowOpacity, shadowRadius: 14, elevation: 8 },
        ]}>
          <View style={[liveCardStyles.iconBox, { backgroundColor: card.icon_bg }]}>
            <Text style={liveCardStyles.icon}>{card.icon}</Text>
          </View>
          <View style={liveCardStyles.cardContent}>
            <Text style={liveCardStyles.cardTitle}>{card.title}</Text>
            <Text style={liveCardStyles.cardDesc}>{card.description}</Text>
            <Text style={[liveCardStyles.cardLink, { color: card.accent_color }]}>{card.link_label}</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function LiveResourceGrid({ cards }: { cards: ResourceCard[] }) {
  const { width } = useWindowDimensions();
  const isDesktop = width > 1024;
  const isTablet  = width > 768 && width <= 1024;

  let columns = 1;
  if (isDesktop) columns = 3;
  else if (isTablet) columns = 2;

  const gap           = 12;
  const totalGapWidth = gap * (columns - 1);
  const sidePadding   = 32;
  const cardWidth = columns === 1
    ? ('100%' as any)
    : (width - sidePadding - totalGapWidth) / columns;

  // If DB has no records yet, fall back to the exact same defaults the user page shows
  const source = cards.length > 0 ? cards : DEFAULT_RESOURCE_CARDS;
  const active = source.filter(c => c.is_active);

  return (
    <View>
      <Text style={liveCardStyles.previewLabel}>LIVE PREVIEW — AS USERS SEE IT</Text>
      <View style={liveCardStyles.grid}>
        {active.map(card => (
          <LiveResourceCard key={card.id} card={card} cardWidth={cardWidth} />
        ))}
      </View>
    </View>
  );
}

const liveCardStyles = StyleSheet.create({
  previewLabel: {
    fontSize: 11, fontWeight: '700', color: NF_BLUE, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: 20, flexDirection: 'column', gap: 12, alignItems: 'flex-start',
  },
  iconBox:     { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  icon:        { fontSize: 28 },
  cardContent: { flex: 1, gap: 8, marginTop: 4, width: '100%' },
  cardTitle:   { fontSize: 17, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  cardDesc:    { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  cardLink:    { fontSize: 14, fontWeight: '700', marginTop: 6 },
});

// ─── Resource Card Visual Preview ─────────────────────────────────────────────

function ResourceCardPreview({ card }: { card: ResourceCard }) {
  return (
    <View style={{
      backgroundColor: colors.bgCard, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: colors.border, gap: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: card.icon_bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>{card.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{card.title}</Text>
          {!card.is_active && (
            <View style={{ backgroundColor: NF_ORANGE + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: NF_ORANGE }}>HIDDEN</Text>
            </View>
          )}
        </View>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: card.accent_color }} />
      </View>
      <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>{card.description}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: card.accent_color }}>{card.link_label}</Text>
    </View>
  );
}

type CardDraft = Omit<ResourceCard, 'id' | 'created_at' | 'updated_at'>;

const BLANK_CARD: CardDraft = {
  title: '', description: '', icon: '📘',
  icon_bg: 'rgba(74,144,226,0.12)', accent_color: '#4A90E2',
  link: '#', link_label: 'Learn More →',
  sort_order: 0, is_active: true,
  slide_deck_url: null, icon_image_url: null,
};

const ACCENT_PRESETS = [
  { color: '#4A90E2', label: 'Blue' },
  { color: '#34D399', label: 'Green' },
  { color: '#FB923C', label: 'Orange' },
  { color: '#F87171', label: 'Red' },
  { color: '#60A5FA', label: 'Sky' },
  { color: '#A78BFA', label: 'Purple' },
  { color: '#FBBF24', label: 'Yellow' },
  { color: '#EC4899', label: 'Pink' },
];

// ─── Inline Card Row (pencil icon opens editor inline) ────────────────────────

function InlineCardRow({
  card,
  onDelete,
  onSaved,
  onDraftChange,
  onEditorClose,
}: {
  card: ResourceCard;
  onDelete: (card: ResourceCard) => void;
  onSaved: () => void;
  onDraftChange: (cardId: string, draft: CardDraft | null) => void;
  onEditorClose: (cardId: string) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [draft, setDraft]   = useState<CardDraft>({
    title: card.title, description: card.description,
    icon: card.icon, icon_bg: card.icon_bg,
    accent_color: card.accent_color, link: card.link,
    link_label: card.link_label, sort_order: card.sort_order,
    is_active: card.is_active,
    slide_deck_url: card.slide_deck_url ?? null,
    icon_image_url: card.icon_image_url ?? null,
  });
  const [saving, setSaving]           = useState(false);
  const [uploadingDeck, setUploadingDeck] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  function set(key: keyof CardDraft, value: any) {
    setDraft(prev => {
      const updated = { ...prev, [key]: value };
      // Bubble updated draft to parent so User View reflects it in real time
      onDraftChange(card.id, updated);
      return updated;
    });
  }

  async function pickIconImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access to upload an icon image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const name  = asset.uri.split('/').pop() ?? 'icon.jpg';
    setUploadingIcon(true);
    try {
      const url = await uploadResourceFile(
        { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' },
        'icons',
      );
      set('icon_image_url', url);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally { setUploadingIcon(false); }
  }

  async function pickContentFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['video/mp4', 'video/quicktime', 'video/webm', 'video/*',
               'application/pdf',
               'application/vnd.ms-powerpoint',
               'application/vnd.openxmlformats-officedocument.presentationml.presentation',
               'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingDeck(true);
      const mime = asset.mimeType ?? 'application/octet-stream';
      const folder = mime.startsWith('video/') ? 'videos' : 'slide-decks';
      const url = await uploadResourceFile(
        { uri: asset.uri, name: asset.name, type: mime, file: (asset as any).file },
        folder,
      );
      set('slide_deck_url', url);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally { setUploadingDeck(false); }
  }

  async function handleSave() {
    if (!draft.title.trim()) { Alert.alert('Validation', 'Title is required.'); return; }
    setSaving(true);
    try {
      await updateResourceCard(card.id, draft);
      setOpen(false);
      onDraftChange(card.id, null); // clear live draft — card is now saved
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  }

  function handleCancel() {
    setOpen(false);
    onDraftChange(card.id, null); // discard live draft on cancel
    onEditorClose(card.id);
  }

  function handleToggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Notify parent of current draft when opening
      onDraftChange(card.id, draft);
    } else {
      onDraftChange(card.id, null);
    }
  }

  const previewCard: ResourceCard = { ...draft, id: card.id, created_at: '', updated_at: '' };

  return (
    <View style={{ gap: 0 }}>
      {/* Card row header — always visible */}
      <View style={inlineStyles.rowHeader}>
        {/* Icon thumbnail */}
        <View style={[inlineStyles.rowIconBox, { backgroundColor: card.icon_bg }]}>
          {card.icon_image_url
            ? <Image source={{ uri: card.icon_image_url }} style={{ width: 28, height: 28, borderRadius: 6 }} />
            : <Text style={{ fontSize: 20 }}>{card.icon}</Text>
          }
        </View>
        {/* Title + status */}
        <View style={{ flex: 1 }}>
          <Text style={inlineStyles.rowTitle} numberOfLines={1}>{card.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
            {!card.is_active && (
              <View style={inlineStyles.hiddenBadge}>
                <Text style={inlineStyles.hiddenBadgeText}>HIDDEN</Text>
              </View>
            )}
            {card.slide_deck_url && (
              <View style={inlineStyles.deckBadge}>
                <Text style={inlineStyles.deckBadgeText}>📎 Deck</Text>
              </View>
            )}
          </View>
        </View>
        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable
            onPress={handleToggleOpen}
            style={[inlineStyles.iconBtn, open && { backgroundColor: NF_BLUE + '22', borderColor: NF_BLUE }]}
          >
            <Text style={{ fontSize: 14 }}>{open ? '✕' : '✏️'}</Text>
          </Pressable>
          <Pressable onPress={() => onDelete(card)} style={inlineStyles.iconBtnRed}>
            <Text style={{ fontSize: 14 }}>🗑</Text>
          </Pressable>
        </View>
      </View>

      {/* Inline editor — slides open when pencil tapped */}
      {open && (
        <View style={inlineStyles.editorBody}>
          {/* Live preview */}
          <Text style={[s.fieldLabel, { marginBottom: 6 }]}>LIVE PREVIEW</Text>
          <ResourceCardPreview card={previewCard} />
          <View style={s.divider} />

          {/* Icon picker — emoji OR image */}
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>ICON — EMOJI OR IMAGE</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, alignItems: 'center' }}>
              {/* Current icon preview */}
              <View style={[inlineStyles.iconPreview, { backgroundColor: draft.icon_bg }]}>
                {draft.icon_image_url
                  ? <Image source={{ uri: draft.icon_image_url }} style={{ width: 36, height: 36, borderRadius: 8 }} />
                  : <Text style={{ fontSize: 24 }}>{draft.icon}</Text>
                }
              </View>
              {/* Emoji input */}
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={draft.icon_image_url ? '' : draft.icon}
                onChangeText={v => { set('icon', v); set('icon_image_url', null); }}
                placeholder="Emoji e.g. 📘"
                placeholderTextColor={colors.textTertiary}
              />
              {/* Upload image button */}
              <Pressable onPress={pickIconImage} disabled={uploadingIcon} style={inlineStyles.uploadBtn}>
                {uploadingIcon
                  ? <ActivityIndicator size="small" color={NF_BLUE} />
                  : <Text style={{ fontSize: 11, fontWeight: '700', color: NF_BLUE }}>📷 Image</Text>
                }
              </Pressable>
            </View>
            {draft.icon_image_url && (
              <Pressable onPress={() => set('icon_image_url', null)} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: NF_RED }}>✕ Remove image — use emoji instead</Text>
              </Pressable>
            )}
          </View>

          <Field label="Title *" value={draft.title} onChangeText={v => set('title', v)} placeholder="Deep Work Blueprint" />
          <Field label="Description *" value={draft.description} onChangeText={v => set('description', v)} placeholder="Short description…" multiline />
          <Field label="Link Label" value={draft.link_label} onChangeText={v => set('link_label', v)} placeholder="Learn More →" />
          <Field label="Sort Order" value={String(draft.sort_order)} onChangeText={v => set('sort_order', parseInt(v) || 0)} placeholder="0" />

          {/* Accent color presets */}
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>ACCENT COLOR</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {ACCENT_PRESETS.map(p => (
                <Pressable key={p.color} onPress={() => { set('accent_color', p.color); set('icon_bg', p.color + '1E'); }}
                  style={{ alignItems: 'center', gap: 3 }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 8, backgroundColor: p.color,
                    borderWidth: draft.accent_color === p.color ? 2.5 : 1,
                    borderColor: draft.accent_color === p.color ? '#fff' : 'rgba(255,255,255,0.1)',
                  }} />
                  <Text style={{ fontSize: 9, color: colors.textTertiary }}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[s.input, { marginTop: 8 }]} value={draft.accent_color}
              onChangeText={v => set('accent_color', v)}
              placeholder="Custom hex e.g. #4A90E2" placeholderTextColor={colors.textTertiary}
            />
          </View>

          {/* Content file upload (video, PDF, PPTX, DOCX, etc.) */}
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>CONTENT FILE (VIDEO, PDF, PPTX, DOCX, …)</Text>
            <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 6 }}>
              Upload MP4/MOV video, PDF, PowerPoint, Word doc, or any file from your computer.
              The viewer auto-detects the file type.
            </Text>
            {draft.slide_deck_url ? (
              <View style={{ gap: 6 }}>
                <View style={inlineStyles.deckRow}>
                  <Text style={{ fontSize: 12, color: NF_GREEN, flex: 1 }} numberOfLines={1}>
                    ✅ File uploaded
                  </Text>
                  <Pressable onPress={() => Linking.openURL(draft.slide_deck_url!)} style={inlineStyles.deckViewBtn}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: NF_BLUE }}>View</Text>
                  </Pressable>
                  <Pressable onPress={pickContentFile} disabled={uploadingDeck} style={inlineStyles.deckViewBtn}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: NF_ORANGE }}>Replace</Text>
                  </Pressable>
                  <Pressable onPress={() => set('slide_deck_url', null)} style={inlineStyles.deckViewBtn}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: NF_RED }}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Pressable onPress={pickContentFile} disabled={uploadingDeck} style={inlineStyles.deckUploadBtn}>
                  {uploadingDeck
                    ? <ActivityIndicator size="small" color={NF_BLUE} />
                    : <>
                        <Text style={{ fontSize: 18 }}>📁</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: NF_BLUE }}>Upload from Computer</Text>
                        <Text style={{ fontSize: 10, color: colors.textTertiary }}>MP4 · MOV · PDF · PPTX · DOCX</Text>
                      </>
                  }
                </Pressable>
                <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }}>— or paste a URL below —</Text>
                <TextInput
                  style={s.input}
                  value={draft.slide_deck_url ?? ''}
                  onChangeText={v => set('slide_deck_url', v || null)}
                  placeholder="https://drive.google.com/…  or  direct file URL"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            )}
          </View>

          <View style={s.toggleRow}>
            <Text style={s.fieldLabel}>VISIBLE TO USERS</Text>
            <Switch
              value={draft.is_active} onValueChange={v => set('is_active', v)}
              trackColor={{ false: colors.border, true: NF_BLUE }} thumbColor="#fff"
            />
          </View>

          <View style={s.rowGap}>
            <Btn label={saving ? 'Saving…' : '💾 Save Card'} onPress={handleSave} disabled={saving} />
            <Btn label="Cancel" onPress={handleCancel} outline color={colors.textSecondary} />
          </View>
        </View>
      )}

      <View style={s.divider} />
    </View>
  );
}

// ─── New card creation form ───────────────────────────────────────────────────

function NewCardForm({
  sortOrder,
  onSave,
  onCancel,
}: {
  sortOrder: number;
  onSave: (draft: CardDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft]             = useState<CardDraft>({ ...BLANK_CARD, sort_order: sortOrder });
  const [saving, setSaving]           = useState(false);
  const [uploadingDeck, setUploadingDeck] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  function set(key: keyof CardDraft, value: any) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  async function pickIconImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access to upload an icon image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const name  = asset.uri.split('/').pop() ?? 'icon.jpg';
    setUploadingIcon(true);
    try {
      const url = await uploadResourceFile({ uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' }, 'icons');
      set('icon_image_url', url);
    } catch (e: any) { Alert.alert('Upload failed', e.message); }
    finally { setUploadingIcon(false); }
  }

  async function pickContentFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['video/mp4', 'video/quicktime', 'video/webm', 'video/*',
               'application/pdf',
               'application/vnd.ms-powerpoint',
               'application/vnd.openxmlformats-officedocument.presentationml.presentation',
               'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingDeck(true);
      const mime = asset.mimeType ?? 'application/octet-stream';
      const folder = mime.startsWith('video/') ? 'videos' : 'slide-decks';
      const url = await uploadResourceFile({ uri: asset.uri, name: asset.name, type: mime, file: (asset as any).file }, folder);
      set('slide_deck_url', url);
    } catch (e: any) { Alert.alert('Upload failed', e.message); }
    finally { setUploadingDeck(false); }
  }

  async function handleSave() {
    if (!draft.title.trim()) { Alert.alert('Validation', 'Title is required.'); return; }
    setSaving(true);
    try { await onSave(draft); } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  }

  const previewCard: ResourceCard = { ...draft, id: 'new', created_at: '', updated_at: '' };

  return (
    <View style={s.editorWrap}>
      <Text style={[s.fieldLabel, { marginBottom: 6 }]}>LIVE PREVIEW</Text>
      <ResourceCardPreview card={previewCard} />
      <View style={s.divider} />

      {/* Icon picker */}
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>ICON — EMOJI OR IMAGE</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, alignItems: 'center' }}>
          <View style={[inlineStyles.iconPreview, { backgroundColor: draft.icon_bg }]}>
            {draft.icon_image_url
              ? <Image source={{ uri: draft.icon_image_url }} style={{ width: 36, height: 36, borderRadius: 8 }} />
              : <Text style={{ fontSize: 24 }}>{draft.icon}</Text>
            }
          </View>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={draft.icon_image_url ? '' : draft.icon}
            onChangeText={v => { set('icon', v); set('icon_image_url', null); }}
            placeholder="Emoji e.g. 📘"
            placeholderTextColor={colors.textTertiary}
          />
          <Pressable onPress={pickIconImage} disabled={uploadingIcon} style={inlineStyles.uploadBtn}>
            {uploadingIcon
              ? <ActivityIndicator size="small" color={NF_BLUE} />
              : <Text style={{ fontSize: 11, fontWeight: '700', color: NF_BLUE }}>📷 Image</Text>
            }
          </Pressable>
        </View>
      </View>

      <Field label="Title *" value={draft.title} onChangeText={v => set('title', v)} placeholder="Deep Work Blueprint" />
      <Field label="Description *" value={draft.description} onChangeText={v => set('description', v)} placeholder="Short description…" multiline />
      <Field label="Link Label" value={draft.link_label} onChangeText={v => set('link_label', v)} placeholder="Learn More →" />
      <Field label="Sort Order" value={String(draft.sort_order)} onChangeText={v => set('sort_order', parseInt(v) || 0)} placeholder="0" />

      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>ACCENT COLOR</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {ACCENT_PRESETS.map(p => (
            <Pressable key={p.color} onPress={() => { set('accent_color', p.color); set('icon_bg', p.color + '1E'); }}
              style={{ alignItems: 'center', gap: 3 }}>
              <View style={{
                width: 32, height: 32, borderRadius: 8, backgroundColor: p.color,
                borderWidth: draft.accent_color === p.color ? 2.5 : 1,
                borderColor: draft.accent_color === p.color ? '#fff' : 'rgba(255,255,255,0.1)',
              }} />
              <Text style={{ fontSize: 9, color: colors.textTertiary }}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Content file upload */}
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>CONTENT FILE (VIDEO, PDF, PPTX, DOCX, …)</Text>
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 6 }}>
          Upload MP4/MOV video, PDF, PowerPoint, Word doc, or any file from your computer.
        </Text>
        {draft.slide_deck_url ? (
          <View style={{ gap: 6 }}>
            <View style={inlineStyles.deckRow}>
              <Text style={{ fontSize: 12, color: NF_GREEN, flex: 1 }}>✅ File uploaded</Text>
              <Pressable onPress={pickContentFile} disabled={uploadingDeck} style={inlineStyles.deckViewBtn}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: NF_ORANGE }}>Replace</Text>
              </Pressable>
              <Pressable onPress={() => set('slide_deck_url', null)} style={inlineStyles.deckViewBtn}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: NF_RED }}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Pressable onPress={pickContentFile} disabled={uploadingDeck} style={inlineStyles.deckUploadBtn}>
              {uploadingDeck
                ? <ActivityIndicator size="small" color={NF_BLUE} />
                : <>
                    <Text style={{ fontSize: 18 }}>📁</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: NF_BLUE }}>Upload from Computer</Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary }}>MP4 · MOV · PDF · PPTX · DOCX</Text>
                  </>
              }
            </Pressable>
            <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }}>— or paste a URL below —</Text>
            <TextInput
              style={s.input}
              value={draft.slide_deck_url ?? ''}
              onChangeText={v => set('slide_deck_url', v || null)}
              placeholder="https://drive.google.com/…  or  direct file URL"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        )}
      </View>

      <View style={s.toggleRow}>
        <Text style={s.fieldLabel}>VISIBLE TO USERS</Text>
        <Switch value={draft.is_active} onValueChange={v => set('is_active', v)}
          trackColor={{ false: colors.border, true: NF_BLUE }} thumbColor="#fff" />
      </View>

      <View style={s.rowGap}>
        <Btn label={saving ? 'Saving…' : '💾 Create Card'} onPress={handleSave} disabled={saving} />
        <Btn label="Cancel" onPress={onCancel} outline color={colors.textSecondary} />
      </View>
    </View>
  );
}

// ─── Resources Manager Section ────────────────────────────────────────────────

function ResourcesSection() {
  const [cards, setCards]             = useState<ResourceCard[]>([]);
  const [loading, setLoading]         = useState(true);
  const [addingNew, setAddingNew]     = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Live drafts: cardId → in-progress draft (null = editor closed / saved)
  const [liveDrafts, setLiveDrafts]   = useState<Record<string, CardDraft | null>>({});

  // Merge saved cards with any open live drafts for real-time User View preview
  const previewCards: ResourceCard[] = cards.map(c => {
    const d = liveDrafts[c.id];
    if (!d) return c;
    return { ...c, ...d };
  });

  // Broadcast channel — sends live draft to any open Resources page in real time
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    channelRef.current = supabase.channel('resource-cards-live');
    channelRef.current.subscribe();
    return () => { channelRef.current?.unsubscribe(); };
  }, []);

  function handleDraftChange(cardId: string, draft: CardDraft | null) {
    setLiveDrafts(prev => ({ ...prev, [cardId]: draft }));
    // Broadcast the updated card to all listeners (Resources page)
    if (draft) {
      const mergedCard = cards.find(c => c.id === cardId);
      if (mergedCard) {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'card-draft',
          payload: { ...mergedCard, ...draft },
        });
      }
    } else {
      // Draft cleared (saved or cancelled) — broadcast saved state
      const savedCard = cards.find(c => c.id === cardId);
      if (savedCard) {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'card-draft',
          payload: savedCard,
        });
      }
    }
  }

  function handleEditorClose(cardId: string) {
    setLiveDrafts(prev => ({ ...prev, [cardId]: null }));
  }

  // Full load with spinner — only on first mount
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetched = await fetchAllResourceCards();
      if (fetched.length > 0) {
        setCards(fetched);
      } else {
        for (const c of DEFAULT_RESOURCE_CARDS) {
          try {
            await createResourceCard({
              title: c.title, description: c.description,
              icon: c.icon, icon_bg: c.icon_bg,
              accent_color: c.accent_color, link: c.link,
              link_label: c.link_label, sort_order: c.sort_order,
              is_active: c.is_active,
              slide_deck_url: null, icon_image_url: null,
            });
          } catch {}
        }
        const seeded = await fetchAllResourceCards();
        setCards(seeded.length > 0 ? seeded : DEFAULT_RESOURCE_CARDS);
      }
    } catch {
      setCards(DEFAULT_RESOURCE_CARDS);
    } finally { setLoading(false); }
  }, []);

  // Silent refresh — no spinner, updates cards in place so User View stays visible
  const silentRefresh = useCallback(async () => {
    try {
      const fetched = await fetchAllResourceCards();
      if (fetched.length > 0) setCards(fetched);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(draft: CardDraft) {
    await createResourceCard(draft);
    setAddingNew(false);
    await silentRefresh();
    Alert.alert('Created', 'Resource card added.');
  }

  async function handleDelete(card: ResourceCard) {
    Alert.alert('Delete Card', `Delete "${card.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteResourceCard(card.id); await silentRefresh(); } },
    ]);
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <SectionHeader title="🗂 Resources Manager" subtitle="Tap ✏️ on any card to edit inline" />
        <Pressable
          onPress={() => setShowPreview(p => !p)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: showPreview ? NF_BLUE + '22' : colors.bgBase,
            borderWidth: 1, borderColor: showPreview ? NF_BLUE : colors.border,
            borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 2,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: showPreview ? NF_BLUE : colors.textSecondary }}>
            {showPreview ? '✕ Close Preview' : '👁 User View'}
          </Text>
        </Pressable>
      </View>

      {showPreview && previewCards.length > 0 && (
        <>
          <LiveResourceGrid cards={previewCards} />
          <View style={s.divider} />
        </>
      )}

      {loading && <ActivityIndicator color={NF_BLUE} style={{ marginVertical: 12 }} />}

      {!loading && !addingNew && (
        <>
          {cards.map(card => (
            <InlineCardRow
              key={card.id}
              card={card}
              onDelete={handleDelete}
              onSaved={silentRefresh}
              onDraftChange={handleDraftChange}
              onEditorClose={handleEditorClose}
            />
          ))}
          <Btn label="+ Add New Card" onPress={() => setAddingNew(true)} color={NF_GREEN} />
        </>
      )}

      {!loading && addingNew && (
        <NewCardForm
          sortOrder={cards.length}
          onSave={handleCreate}
          onCancel={() => setAddingNew(false)}
        />
      )}
    </Card>
  );
}

// ─── Inline card styles ───────────────────────────────────────────────────────
const inlineStyles = StyleSheet.create({
  rowHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
  },
  rowIconBox: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  hiddenBadge: {
    backgroundColor: NF_ORANGE + '22', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
  },
  hiddenBadgeText: { fontSize: 9, fontWeight: '700', color: NF_ORANGE },
  deckBadge: {
    backgroundColor: NF_GREEN + '22', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
  },
  deckBadgeText: { fontSize: 9, fontWeight: '700', color: NF_GREEN },
  iconBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  iconBtnRed: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    borderColor: NF_RED + '44', alignItems: 'center', justifyContent: 'center',
    backgroundColor: NF_RED + '0A',
  },
  editorBody: {
    backgroundColor: colors.bgBase, borderRadius: 12,
    borderWidth: 1, borderColor: NF_BLUE + '33',
    padding: 16, gap: 14, marginBottom: 4,
  },
  iconPreview: {
    width: 52, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  uploadBtn: {
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: NF_BLUE + '14', borderRadius: 8,
    borderWidth: 1, borderColor: NF_BLUE + '33',
    alignItems: 'center', justifyContent: 'center', minWidth: 72,
  },
  deckUploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 10,
    backgroundColor: NF_BLUE + '0F', borderWidth: 1.5,
    borderColor: NF_BLUE + '33', borderStyle: 'dashed',
  },
  deckRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: NF_GREEN + '0F', borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: NF_GREEN + '33',
  },
  deckViewBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.bgCard, borderRadius: 6,
    borderWidth: 1, borderColor: colors.border,
  },
});

// ─── User Monitor ─────────────────────────────────────────────────────────────

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
        const { data, error } = await supabase
          .from('users').select('*').order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        setUsers((data ?? []) as UserRow[]);
      } catch (e: any) {
        Alert.alert('Error loading users', e.message);
      } finally { setLoading(false); }
    })();
  }, []);

  // A user is "active" if they have an email and are onboarded,
  // OR if they are the admin (essentiallifekits@gmail.com)
  function isActive(u: UserRow) {
    if (u.email?.toLowerCase() === ADMIN_EMAIL) return true;
    return u.onboarded === true;
  }

  return (
    <Card style={{ paddingBottom: 0 }}>
      <SectionHeader
        title={`👥 User Monitor (${users.length})`}
        subtitle="All registered NeuroFlow accounts · Green = active"
      />
      {loading && <ActivityIndicator color={NF_BLUE} style={{ marginVertical: 12 }} />}
      {!loading && users.length === 0 && (
        <Text style={s.emptyText}>No users found.</Text>
      )}
      {/* Scrollable container — max height so it scrolls when many users */}
      {!loading && users.length > 0 && (
        <ScrollView
          style={{ maxHeight: 420 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator={true}
        >
          {users.map((u, idx) => {
            const active = isActive(u);
            const joinedDate = new Date(u.created_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            });
            return (
              <View key={u.id} style={[s.userRow, idx === users.length - 1 && { borderBottomWidth: 0 }]}>
                {/* Avatar */}
                <View style={s.userAvatar}>
                  <Text style={s.userAvatarText}>
                    {(u.display_name ?? u.email)?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.userName}>{u.display_name ?? '—'}</Text>
                  <Text style={s.userEmail}>{u.email}</Text>
                  <Text style={s.userSince}>Joined {joinedDate}</Text>
                </View>

                {/* Status indicator */}
                <View style={{ alignItems: 'center', gap: 4 }}>
                  {active ? (
                    <>
                      {/* Glowing green dot */}
                      <View style={s.activeDotWrap}>
                        <View style={s.activeDotGlow} />
                        <View style={s.activeDot} />
                      </View>
                      <Text style={s.activeLabel}>Active</Text>
                    </>
                  ) : (
                    <>
                      <View style={s.pendingDot} />
                      <Text style={s.pendingLabel}>Pending</Text>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
      <View style={{ height: 8 }} />
    </Card>
  );
}

// ─── Admin Portal Screen ──────────────────────────────────────────────────────

export default function AdminScreen() {
  const { user }  = useAuth();
  const router    = useRouter();
  const [settings, setSettings]           = useState<Record<string, string>>({});
  const [loadingSettings, setLoadingSettings] = useState(true);

  const userEmail = user?.email ?? '';
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
            <EmailTemplateSection settings={settings} onSave={handleSaveSetting} />
            <ResourcesSection />
            <HowToVideoSection settings={settings} onSave={handleSaveSetting} />
            <AppSettingsSection settings={settings} onSave={handleSaveSetting} />
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

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(74,144,226,0.12)', justifyContent: 'center', alignItems: 'center' },
  backBtnText:  { fontSize: 22, color: NF_BLUE, lineHeight: 28, fontWeight: '600' },
  pageTitle:    { fontSize: 22, fontWeight: '800', color: NF_BLUE, letterSpacing: -0.5 },
  pageSub:      { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  adminBadge:   { backgroundColor: 'rgba(74,144,226,0.12)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: NF_BLUE + '44' },
  adminBadgeText: { fontSize: 12, fontWeight: '700', color: NF_BLUE },

  card: { backgroundColor: colors.bgCard, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },

  sectionHeader: { marginBottom: 4 },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  sectionSub:    { fontSize: 12, color: colors.textSecondary, marginTop: 3 },

  fieldWrap:  { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: colors.textPrimary,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },

  btn:          { borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  btnSmall:     { paddingHorizontal: 10, paddingVertical: 6 },
  btnText:      { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnTextSmall: { fontSize: 12 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowGap:    { flexDirection: 'row', gap: 8 },
  divider:   { height: 1, backgroundColor: colors.border, marginVertical: 4 },

  editorWrap: { gap: spacing.md, paddingTop: 4 },

  // User monitor
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  userAvatar:     { width: 38, height: 38, borderRadius: 19, backgroundColor: NF_BLUE + '22', justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { fontSize: 15, fontWeight: '800', color: NF_BLUE },
  userName:       { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  userEmail:      { fontSize: 11, color: colors.textSecondary },
  userSince:      { fontSize: 10, color: colors.textTertiary },

  // Active green glow indicator
  activeDotWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  activeDotGlow: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: NF_GREEN + '33' },
  activeDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: NF_GREEN },
  activeLabel:   { fontSize: 9, fontWeight: '700', color: NF_GREEN },
  pendingDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  pendingLabel:  { fontSize: 9, color: colors.textTertiary },

  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: 8 },

  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: 12 },
  lockIcon:   { fontSize: 48 },
  lockTitle:  { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  lockSub:    { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
