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
  Platform,
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

// ─── Web-native file picker — bypasses expo-document-picker blob-URL issue ───
// On web, expo-document-picker gives a blob URL which requires reading the
// entire file into memory before uploading. This uses a hidden <input type="file">
// instead, giving us the raw File object that Supabase can stream directly.
function pickFileWeb(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const input = document.createElement('input') as HTMLInputElement;
    input.type = 'file';
    input.accept = accept;
    input.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
    let settled = false;
    const cleanup = () => { try { document.body.removeChild(input); } catch {} };
    input.addEventListener('change', () => {
      if (settled) return;
      settled = true;
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    });
    // Detect cancel — window regains focus after picker closes with no selection
    const onWindowFocus = () => {
      setTimeout(() => {
        if (!settled) { settled = true; cleanup(); resolve(null); }
      }, 500);
    };
    window.addEventListener('focus', onWindowFocus, { once: true });
    input.click();
  });
}

// Upload a File object directly to Supabase storage (no memory double-read)
async function uploadFileToStorage(
  file: File,
  folder: 'slide-decks' | 'icons' | 'videos',
): Promise<string> {
  const path = `${folder}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage
    .from('resource-assets')
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('resource-assets').getPublicUrl(path);
  return data.publicUrl;
}

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

/** Collapsible accordion wrapper — replaces Card + SectionHeader in every section */
function AccordionCard({
  title, subtitle, children, defaultOpen = false, style,
}: {
  title: string; subtitle?: string; children: React.ReactNode;
  defaultOpen?: boolean; style?: any;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const chevron = open ? '▾' : '▸';
  return (
    <View style={[s.card, style]}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>{title}</Text>
          {subtitle && !open && (
            <Text style={[s.sectionSub, { marginTop: 2 }]} numberOfLines={1}>{subtitle}</Text>
          )}
        </View>
        <Text style={{ fontSize: 18, color: NF_BLUE, marginLeft: 12 }}>{chevron}</Text>
      </Pressable>
      {open && (
        <View style={{ marginTop: 14, gap: 14 }}>
          {subtitle && <Text style={s.sectionSub}>{subtitle}</Text>}
          {children}
        </View>
      )}
    </View>
  );
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

function PreviewEmailButton({ onPress }: { onPress: () => void }) {
  if (Platform.OS === 'web') {
    return React.createElement('button', {
      type: 'button',
      onClick: onPress,
      onMouseDown: onPress,
      onPointerDown: onPress,
      style: {
        border: `1px solid ${NF_BLUE}`,
        background: 'transparent',
        color: NF_BLUE,
        borderRadius: 10,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      },
    }, '👁 Preview Email');
  }

  return <Btn label="👁 Preview Email" onPress={onPress} outline color={NF_BLUE} small />;
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

const SAMPLE_THUMBNAIL =
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=320&q=80';

const EMAIL_TEXT_DEFAULTS = {
  brandName: 'NeuroFlow',
  productName: 'Focus Planner',
  badgeEmoji: '⏰',
  badgeText: 'DEADLINE',
  greetingTemplate: 'Hi {{name}}',
  greetingEmoji: '👋',
  atTimeHeadlineEmoji: '🎯',
  atTimeHeadlineTemplate: "It's time: {{title}}",
  reminderHeadlineEmoji: '⏰',
  reminderHeadlineTemplate: 'Reminder: {{title}}',
  atTimeSubline: 'Your scheduled task is happening now.',
  reminderSubline: 'Your scheduled task is coming up soon.',
  cardEmoji: '⏰',
  sampleTitle: 'Test Suva Seeds Video 10:30pm',
  dateLabel: 'DATE',
  dateEmoji: '📅',
  sampleDate: 'Thursday, May 7, 2026',
  timeLabel: 'TIME',
  timeEmoji: '🕐',
  sampleTime: '10:30 PM',
  atTimeBody: "Open NeuroFlow and stay in your flow state. You've got this! 🌸",
  reminderBody: 'Head to your NeuroFlow planner to review your task.',
  contactLine: 'Add neuroflow.reminders@gmail.com to your contacts to ensure all alerts reach your inbox.',
};

type EmailPreviewText = typeof EMAIL_TEXT_DEFAULTS;

function normalizeHex(value: string, fallback: string) {
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) return `#${trimmed.toUpperCase()}`;
  return fallback;
}

function hslToHex(h: number, s = 92, l = 54) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

const BOARD_COLORS = [
  '#FF3B30', '#FF9500', '#FFFF00', '#00E51D', '#20E4F5', '#064DFF', '#D43CFF', '#B73AB8', '#A67C52', '#FFFFFF', '#9B9B9B', '#111111',
  '#F5F5F5', '#E9E9E9', '#D4D4D4', '#BDBDBD', '#A5A5A5', '#8A8A8A', '#6F6F6F', '#545454', '#3D3D3D', '#282828', '#151515',
  '#083B46', '#093B74', '#261052', '#4A105C', '#6D163A', '#84230D', '#7C2C00', '#6E4200', '#665000', '#6F7300', '#466B18',
  '#0B6078', '#0E55A4', '#3E2085', '#64228C', '#8C2456', '#B43A14', '#B84E05', '#A86500', '#A47C00', '#A5A900', '#5F842E',
  '#158AA5', '#1472D4', '#5730B9', '#8B2DB2', '#B93575', '#E24A1A', '#E56405', '#D68700', '#D0AD00', '#D3DB00', '#77A944',
  '#1FB6D5', '#208BFF', '#7444ED', '#BA42EF', '#ED4D97', '#FF6137', '#FF7F15', '#FFA31E', '#FFC928', '#EDFF39', '#8AD157',
  '#66D6E6', '#7FB8FF', '#9A73F5', '#D674F4', '#F480B5', '#FF9278', '#FFAD69', '#FFC878', '#FFE27A', '#F2FF86', '#A8DD82',
  '#B8EDF5', '#C2DAFF', '#D4BEFF', '#EFC1FA', '#FFD0E4', '#FFD2C9', '#FFE0C5', '#FFEBCD', '#FFF4CB', '#FBFFD0', '#D6EFC3',
];

function NativeButton({ label, onPress, style }: { label: string; onPress: () => void; style?: any }) {
  if (Platform.OS === 'web') {
    return React.createElement('button', {
      type: 'button',
      onClick: onPress,
      style: {
        border: 0,
        borderRadius: 9,
        padding: '9px 18px',
        background: '#3A3A40',
        color: '#fff',
        fontWeight: 800,
        fontSize: 15,
        cursor: 'pointer',
        ...(style || {}),
      },
    }, label);
  }
  return (
    <Pressable onPress={onPress} style={[{ borderRadius: 9, paddingHorizontal: 18, paddingVertical: 9, backgroundColor: '#3A3A40' }, style]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

function ColorDetailPopup({
  color,
  onChange,
  onClose,
}: {
  color: string;
  onChange: (next: string) => void;
  onClose: () => void;
}) {
  const [hue, setHue] = useState(210);
  const { width } = useWindowDimensions();
  const isNarrow = width < 760;
  const wheelSize = isNarrow ? Math.min(width - 108, 250) : 310;

  const pickWithDropper = async () => {
    const picker = typeof window !== 'undefined' ? (window as any).EyeDropper : null;
    if (!picker) return;
    try {
      const result = await new picker().open();
      if (result?.sRGBHex) onChange(result.sRGBHex.toUpperCase());
    } catch {}
  };

  const wheel = Platform.OS === 'web'
    ? React.createElement('div', {
        onClick: () => onChange(hslToHex(hue)),
        style: {
          width: wheelSize,
          height: wheelSize,
          maxWidth: '100%',
          borderRadius: '50%',
          margin: '18px auto 22px',
          position: 'relative',
          cursor: 'crosshair',
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.55) 28%, rgba(255,255,255,0) 58%), conic-gradient(#ff0040, #ff7a00, #fbff00, #00d936, #00d2ff, #263cff, #d000ff, #ff0040)',
        },
      },
      React.createElement('div', { style: { position: 'absolute', left: '32%', top: '25%', width: 22, height: 22, border: '2px solid #000', borderRadius: '50%', transform: 'translate(-50%,-50%)' } }),
      React.createElement('div', { style: { position: 'absolute', left: '32%', top: '25%', width: 30, height: 2, background: '#000', transform: 'translate(-50%,-50%)' } }),
      React.createElement('div', { style: { position: 'absolute', left: '32%', top: '25%', width: 2, height: 30, background: '#000', transform: 'translate(-50%,-50%)' } }))
    : <View style={{ width: 260, height: 260, borderRadius: 130, backgroundColor: color, alignSelf: 'center', marginVertical: 18 }} />;

  const pickerContent = (
      <ScrollView
        style={{ maxHeight: isNarrow ? 'calc(100vh - 150px)' : undefined } as any}
        contentContainerStyle={{ padding: 18, paddingBottom: isNarrow ? 22 : 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ flex: 1, textAlign: 'center', color: '#9B9BA3', fontSize: 18, fontWeight: '700' }}>Colors</Text>
          <NativeButton label="×" onPress={onClose} style={{ padding: '4px 10px', borderRadius: 14, background: '#303036' }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: isNarrow ? 10 : 16, marginTop: 12 }}>
          <View style={{ width: 76, height: 52, borderRadius: 12, backgroundColor: '#2A2B30', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color }} />
          </View>
          <View style={{ gap: 3 }}>
            <View style={{ width: 42, height: 6, backgroundColor: '#ff6b7f', borderRadius: 4 }} />
            <View style={{ width: 42, height: 6, backgroundColor: '#4ade80', borderRadius: 4 }} />
            <View style={{ width: 42, height: 6, backgroundColor: '#818cf8', borderRadius: 4 }} />
          </View>
          <Text style={{ fontSize: 30 }}>🔳</Text>
          <Text style={{ fontSize: 30 }}>🌄</Text>
          <Text style={{ fontSize: 30 }}>🖍️</Text>
        </View>
        {wheel}
        {Platform.OS === 'web' ? React.createElement('input', {
          type: 'range',
          min: 0,
          max: 360,
          value: hue,
          onChange: (e: any) => {
            const nextHue = Number(e.target.value);
            setHue(nextHue);
            onChange(hslToHex(nextHue));
          },
          style: {
            width: '100%',
            accentColor: color,
            cursor: 'pointer',
          },
        }) : null}
        {isNarrow ? (
          <View style={{ gap: 12, marginTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <NativeButton label="🖌" onPress={pickWithDropper} style={{ background: 'transparent', color: '#d7d7dc', fontSize: 22, padding: '6px 8px' }} />
              <View style={{ width: 58, height: 58, borderRadius: 10, backgroundColor: color, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }} />
              <View style={{ borderWidth: 1, borderColor: '#3a3a42', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: '#f0f0f5', fontWeight: '800' }}>100%</Text>
              </View>
            </View>
            <View>
              <Text style={{ color: '#f0f0f5', fontWeight: '800', marginBottom: 8 }}>Opacity</Text>
              {Platform.OS === 'web' ? React.createElement('input', {
                type: 'range',
                min: 0,
                max: 100,
                value: 100,
                readOnly: true,
                style: { width: '100%', accentColor: '#f0f0f5' },
              }) : null}
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 }}>
            <NativeButton label="🖌" onPress={pickWithDropper} style={{ background: 'transparent', color: '#d7d7dc', fontSize: 22, padding: '6px 8px' }} />
            <View style={{ width: 58, height: 58, borderRadius: 10, backgroundColor: color, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#f0f0f5', fontWeight: '800', marginBottom: 8 }}>Opacity</Text>
              {Platform.OS === 'web' ? React.createElement('input', {
                type: 'range',
                min: 0,
                max: 100,
                value: 100,
                readOnly: true,
                style: { width: '100%', accentColor: '#f0f0f5' },
              }) : null}
            </View>
            <View style={{ borderWidth: 1, borderColor: '#3a3a42', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: '#f0f0f5', fontWeight: '800' }}>100%</Text>
            </View>
          </View>
        )}
      </ScrollView>
  );

  if (isNarrow) {
    return (
      <Modal transparent visible animationType="fade" onRequestClose={onClose}>
        <View style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: 18,
          paddingVertical: 72,
          backgroundColor: 'rgba(0,0,0,0.58)',
          zIndex: 999,
        }}>
          <View style={{
            width: '100%',
            maxWidth: 380,
            alignSelf: 'center',
            backgroundColor: '#202124',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: '#4A4A4F',
            overflow: 'hidden',
            boxShadow: Platform.OS === 'web' ? '0 24px 70px rgba(0,0,0,0.5)' : undefined,
          } as any}>
            {pickerContent}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View style={{
      position: 'absolute',
      left: 0,
      top: 98,
      width: 380,
      maxWidth: '100%',
      backgroundColor: '#202124',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: '#4A4A4F',
      padding: 0,
      zIndex: 999,
      boxShadow: Platform.OS === 'web' ? '0 24px 70px rgba(0,0,0,0.5)' : undefined,
    } as any}>
      {pickerContent}
    </View>
  );
}

function ColorBoardPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [boardOpen, setBoardOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isNarrow = width < 760;
  const normalized = normalizeHex(value, NF_BLUE);
  const boardWidth = isNarrow ? Math.min(width - 32, 318) : 318;

  return (
    <View style={{ position: 'relative', zIndex: boardOpen || detailOpen ? 60 : 1 }}>
      <Pressable
        onPress={() => { setBoardOpen(v => !v); setDetailOpen(false); }}
        style={{ width: 92, height: 46, borderRadius: 8, backgroundColor: normalized, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }}
      />
      {boardOpen && (
        <Modal transparent visible animationType="fade" onRequestClose={() => { setBoardOpen(false); setDetailOpen(false); }}>
          <Pressable
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: isNarrow ? 'center' : 'flex-start',
              paddingTop: isNarrow ? 0 : 130,
              paddingHorizontal: 16,
              backgroundColor: 'rgba(0,0,0,0.34)',
            }}
            onPress={() => { setBoardOpen(false); setDetailOpen(false); }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                width: boardWidth,
                backgroundColor: '#15151d',
                borderRadius: 22,
                borderWidth: 1,
                borderColor: '#4A4A55',
                padding: 18,
                boxShadow: Platform.OS === 'web' ? '0 18px 52px rgba(0,0,0,0.58)' : undefined,
              } as any}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                {BOARD_COLORS.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => onChange(c)}
                    style={{
                      width: 22,
                      height: 22,
                      backgroundColor: c,
                      borderWidth: normalized === c ? 2 : 1,
                      borderColor: normalized === c ? '#fff' : '#111',
                    }}
                  />
                ))}
              </View>
              <View style={{ alignItems: 'center', marginTop: 16 }}>
                <NativeButton label="Show Colors..." onPress={() => setDetailOpen(true)} />
              </View>
              {detailOpen && (
                <ColorDetailPopup
                  color={normalized}
                  onChange={onChange}
                  onClose={() => setDetailOpen(false)}
                />
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

function ColorWheelField({
  label,
  color,
  onChange,
}: {
  label: string;
  color: string;
  onChange: (next: string) => void;
}) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 760;
  return (
    <View style={{ flex: 1, minWidth: 220, gap: 8 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: isNarrow ? 'column' : 'row', alignItems: isNarrow ? 'stretch' : 'center', gap: 12 }}>
        <ColorBoardPicker value={color} onChange={onChange} />
        <View style={{ flex: 1, minWidth: 120 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Hex</Text>
          <TextInput
            style={s.input}
            value={color}
            onChangeText={v => onChange(normalizeHex(v, v))}
            placeholder="#4A90E2"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
          />
        </View>
      </View>
    </View>
  );
}

function EmailMiniPreview({
  headerColor,
  accentColor,
  footerText,
  text,
  compact = false,
}: {
  headerColor: string;
  accentColor: string;
  footerText: string;
  text: EmailPreviewText;
  compact?: boolean;
}) {
  const pad = compact ? 16 : 24;
  const headline = text.atTimeHeadlineTemplate.replace('{{title}}', text.sampleTitle);
  const greeting = text.greetingTemplate.replace('{{name}}', 'Erik');
  return (
    <View style={{ backgroundColor: '#15152a', borderRadius: 18, borderWidth: 1, borderColor: '#2a2a3e', overflow: 'hidden' }}>
      <View style={{ backgroundColor: '#1a1a2e', padding: compact ? 14 : 20, borderBottomWidth: 1, borderBottomColor: '#2a2a3e', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Image source={require('../../assets/neuroflow-logo.png')} style={{ width: compact ? 20 : 28, height: compact ? 20 : 28, borderRadius: 5 }} />
          <Text style={{ fontSize: compact ? 14 : 18, fontWeight: '800', color: headerColor }} numberOfLines={1}>{text.brandName} <Text style={{ fontSize: compact ? 8 : 11, color: '#8b8b9e', fontWeight: '500' }}>{text.productName}</Text></Text>
        </View>
        <View style={{ backgroundColor: accentColor + '22', borderWidth: 1, borderColor: accentColor + '66', paddingHorizontal: compact ? 8 : 10, paddingVertical: 4, borderRadius: 20 }}>
          <Text style={{ color: accentColor, fontSize: compact ? 8 : 10, fontWeight: '800' }}>{text.badgeEmoji} {text.badgeText}</Text>
        </View>
      </View>

      <View style={{ padding: pad }}>
        <Text style={{ fontSize: compact ? 11 : 13, color: '#9ca3af', marginBottom: 6 }}>{greeting} {text.greetingEmoji}</Text>
        <Text style={{ fontSize: compact ? 14 : 18, fontWeight: '800', color: '#f0f0f5', marginBottom: 5 }}>{text.atTimeHeadlineEmoji} {headline}</Text>
        <Text style={{ fontSize: compact ? 11 : 13, color: '#9ca3af', marginBottom: compact ? 14 : 20 }}>{text.atTimeSubline}</Text>

        <View style={{ backgroundColor: '#1e1e35', borderWidth: 1, borderColor: accentColor + '55', borderLeftWidth: 4, borderLeftColor: accentColor, borderRadius: 12, padding: compact ? 12 : 16, marginBottom: compact ? 14 : 20, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: compact ? 12 : 15, fontWeight: '800', color: '#f0f0f5', marginBottom: 9 }} numberOfLines={2}>{text.cardEmoji} {text.sampleTitle}</Text>
            <View style={{ flexDirection: 'row', gap: compact ? 14 : 24, flexWrap: 'wrap' }}>
              <View>
                <Text style={{ fontSize: compact ? 8 : 10, fontWeight: '800', color: '#7b8190', textTransform: 'uppercase' }}>{text.dateLabel}</Text>
                <Text style={{ fontSize: compact ? 10 : 13, fontWeight: '700', color: '#e5e7eb', marginTop: 3 }}>{text.dateEmoji} {text.sampleDate}</Text>
              </View>
              <View>
                <Text style={{ fontSize: compact ? 8 : 10, fontWeight: '800', color: '#7b8190', textTransform: 'uppercase' }}>{text.timeLabel}</Text>
                <Text style={{ fontSize: compact ? 10 : 13, fontWeight: '700', color: '#e5e7eb', marginTop: 3 }}>{text.timeEmoji} {text.sampleTime}</Text>
              </View>
            </View>
          </View>
          <View style={{ width: compact ? 82 : 132, aspectRatio: 1.25, borderRadius: 10, borderWidth: 2, borderColor: accentColor, overflow: 'hidden', backgroundColor: '#0e0e1a' }}>
            <Image source={{ uri: SAMPLE_THUMBNAIL }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
        </View>

        <Text style={{ fontSize: compact ? 10 : 12, color: '#9ca3af', lineHeight: compact ? 16 : 20 }}>{text.atTimeBody}</Text>
      </View>

      <View style={{ backgroundColor: '#0e0e1a', padding: compact ? 12 : 16, borderTopWidth: 1, borderTopColor: '#2a2a3e' }}>
        <Text style={{ fontSize: compact ? 8 : 10, color: '#5b6170', textAlign: 'center' }}>{footerText}</Text>
        <Text style={{ fontSize: compact ? 7 : 9, color: '#394050', textAlign: 'center', marginTop: 6 }}>{text.contactLine}</Text>
      </View>
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
  const { width } = useWindowDimensions();
  const isNarrow = width < 760;
  const [fromEmail,    setFromEmail]    = useState(settings['from_email'] ?? '');
  const [subjectTask,  setSubjectTask]  = useState(settings['email_subject_task'] ?? '🎯 Now: {{title}}');
  const [subjectRem,   setSubjectRem]   = useState(settings['email_subject_reminder'] ?? '⏰ Reminder: {{title}}');
  const [headerColor,  setHeaderColor]  = useState(settings['email_header_color'] ?? '#4A90E2');
  const [accentColor,  setAccentColor]  = useState(settings['email_accent_color'] ?? '#4A90E2');
  const [footerText,   setFooterText]   = useState(settings['email_footer_text'] ?? 'Sent by NeuroFlow · ADHD Focus Planner · Built for your brain ✨');
  const [emailText, setEmailText] = useState<EmailPreviewText>({
    brandName: settings['email_brand_name'] ?? EMAIL_TEXT_DEFAULTS.brandName,
    productName: settings['email_product_name'] ?? EMAIL_TEXT_DEFAULTS.productName,
    badgeEmoji: settings['email_badge_emoji'] ?? EMAIL_TEXT_DEFAULTS.badgeEmoji,
    badgeText: settings['email_badge_text'] ?? EMAIL_TEXT_DEFAULTS.badgeText,
    greetingTemplate: settings['email_greeting_template'] ?? EMAIL_TEXT_DEFAULTS.greetingTemplate,
    greetingEmoji: settings['email_greeting_emoji'] ?? EMAIL_TEXT_DEFAULTS.greetingEmoji,
    atTimeHeadlineEmoji: settings['email_at_time_headline_emoji'] ?? EMAIL_TEXT_DEFAULTS.atTimeHeadlineEmoji,
    atTimeHeadlineTemplate: settings['email_at_time_headline_template'] ?? EMAIL_TEXT_DEFAULTS.atTimeHeadlineTemplate,
    reminderHeadlineEmoji: settings['email_reminder_headline_emoji'] ?? EMAIL_TEXT_DEFAULTS.reminderHeadlineEmoji,
    reminderHeadlineTemplate: settings['email_reminder_headline_template'] ?? EMAIL_TEXT_DEFAULTS.reminderHeadlineTemplate,
    atTimeSubline: settings['email_at_time_subline'] ?? EMAIL_TEXT_DEFAULTS.atTimeSubline,
    reminderSubline: settings['email_reminder_subline'] ?? EMAIL_TEXT_DEFAULTS.reminderSubline,
    cardEmoji: settings['email_card_emoji'] ?? EMAIL_TEXT_DEFAULTS.cardEmoji,
    sampleTitle: settings['email_sample_title'] ?? EMAIL_TEXT_DEFAULTS.sampleTitle,
    dateLabel: settings['email_date_label'] ?? EMAIL_TEXT_DEFAULTS.dateLabel,
    dateEmoji: settings['email_date_emoji'] ?? EMAIL_TEXT_DEFAULTS.dateEmoji,
    sampleDate: settings['email_sample_date'] ?? EMAIL_TEXT_DEFAULTS.sampleDate,
    timeLabel: settings['email_time_label'] ?? EMAIL_TEXT_DEFAULTS.timeLabel,
    timeEmoji: settings['email_time_emoji'] ?? EMAIL_TEXT_DEFAULTS.timeEmoji,
    sampleTime: settings['email_sample_time'] ?? EMAIL_TEXT_DEFAULTS.sampleTime,
    atTimeBody: settings['email_at_time_body'] ?? EMAIL_TEXT_DEFAULTS.atTimeBody,
    reminderBody: settings['email_reminder_body'] ?? EMAIL_TEXT_DEFAULTS.reminderBody,
    contactLine: settings['email_contact_line'] ?? EMAIL_TEXT_DEFAULTS.contactLine,
  });
  const [previewOpen,  setPreviewOpen]  = useState(false);
  const [saving, setSaving]            = useState(false);
  const updateEmailText = (key: keyof EmailPreviewText, value: string) => {
    setEmailText(prev => ({ ...prev, [key]: value }));
  };

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
        onSave('email_brand_name', emailText.brandName),
        onSave('email_product_name', emailText.productName),
        onSave('email_badge_emoji', emailText.badgeEmoji),
        onSave('email_badge_text', emailText.badgeText),
        onSave('email_greeting_template', emailText.greetingTemplate),
        onSave('email_greeting_emoji', emailText.greetingEmoji),
        onSave('email_at_time_headline_emoji', emailText.atTimeHeadlineEmoji),
        onSave('email_at_time_headline_template', emailText.atTimeHeadlineTemplate),
        onSave('email_reminder_headline_emoji', emailText.reminderHeadlineEmoji),
        onSave('email_reminder_headline_template', emailText.reminderHeadlineTemplate),
        onSave('email_at_time_subline', emailText.atTimeSubline),
        onSave('email_reminder_subline', emailText.reminderSubline),
        onSave('email_card_emoji', emailText.cardEmoji),
        onSave('email_sample_title', emailText.sampleTitle),
        onSave('email_date_label', emailText.dateLabel),
        onSave('email_date_emoji', emailText.dateEmoji),
        onSave('email_sample_date', emailText.sampleDate),
        onSave('email_time_label', emailText.timeLabel),
        onSave('email_time_emoji', emailText.timeEmoji),
        onSave('email_sample_time', emailText.sampleTime),
        onSave('email_at_time_body', emailText.atTimeBody),
        onSave('email_reminder_body', emailText.reminderBody),
        onSave('email_contact_line', emailText.contactLine),
      ]);
      Alert.alert('Saved', 'Email template config updated.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccordionCard title="✉️ Email Template Editor" subtitle="Edit content, colors, and preview the live template">
      <View style={{ gap: spacing.md, position: 'relative' }}>

      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <ColorSwatch color={headerColor} label="Header" />
        <ColorSwatch color={accentColor} label="Accent" />
        <View style={{ flex: 1 }} />
        <PreviewEmailButton onPress={() => setPreviewOpen(true)} />
      </View>

      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
        <ColorWheelField label="Header / Brand Color" color={headerColor} onChange={setHeaderColor} />
        <ColorWheelField label="Accent / Card Border Color" color={accentColor} onChange={setAccentColor} />
      </View>

      <Field label="From Email Address" value={fromEmail} onChangeText={setFromEmail} placeholder="NeuroFlow <reminders@keepzbrandai.com>" />
      <Field label="At-Time Subject  (use {{title}})" value={subjectTask} onChangeText={setSubjectTask} />
      <Field label="Reminder Subject  (use {{title}})" value={subjectRem} onChangeText={setSubjectRem} />
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Field label="Brand Name" value={emailText.brandName} onChangeText={v => updateEmailText('brandName', v)} />
        </View>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Field label="Product / Header Text" value={emailText.productName} onChangeText={v => updateEmailText('productName', v)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ width: 140 }}>
          <Field label="Badge Emoji" value={emailText.badgeEmoji} onChangeText={v => updateEmailText('badgeEmoji', v)} />
        </View>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Field label="Badge Text" value={emailText.badgeText} onChangeText={v => updateEmailText('badgeText', v)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Field label="Greeting Text (use {{name}})" value={emailText.greetingTemplate} onChangeText={v => updateEmailText('greetingTemplate', v)} />
        </View>
        <View style={{ width: 140 }}>
          <Field label="Greeting Emoji" value={emailText.greetingEmoji} onChangeText={v => updateEmailText('greetingEmoji', v)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ width: 140 }}>
          <Field label="At-Time Emoji" value={emailText.atTimeHeadlineEmoji} onChangeText={v => updateEmailText('atTimeHeadlineEmoji', v)} />
        </View>
        <View style={{ flex: 1, minWidth: 260 }}>
          <Field label="At-Time Headline (use {{title}})" value={emailText.atTimeHeadlineTemplate} onChangeText={v => updateEmailText('atTimeHeadlineTemplate', v)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ width: 140 }}>
          <Field label="Reminder Emoji" value={emailText.reminderHeadlineEmoji} onChangeText={v => updateEmailText('reminderHeadlineEmoji', v)} />
        </View>
        <View style={{ flex: 1, minWidth: 260 }}>
          <Field label="Reminder Headline (use {{title}})" value={emailText.reminderHeadlineTemplate} onChangeText={v => updateEmailText('reminderHeadlineTemplate', v)} />
        </View>
      </View>
      <Field label="At-Time Subline" value={emailText.atTimeSubline} onChangeText={v => updateEmailText('atTimeSubline', v)} />
      <Field label="Reminder Subline" value={emailText.reminderSubline} onChangeText={v => updateEmailText('reminderSubline', v)} />
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ width: 140 }}>
          <Field label="Card Emoji" value={emailText.cardEmoji} onChangeText={v => updateEmailText('cardEmoji', v)} />
        </View>
        <View style={{ flex: 1, minWidth: 260 }}>
          <Field label="Preview Task Title" value={emailText.sampleTitle} onChangeText={v => updateEmailText('sampleTitle', v)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Field label="Date Label" value={emailText.dateLabel} onChangeText={v => updateEmailText('dateLabel', v)} />
        </View>
        <View style={{ width: 140 }}>
          <Field label="Date Emoji" value={emailText.dateEmoji} onChangeText={v => updateEmailText('dateEmoji', v)} />
        </View>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Field label="Preview Date" value={emailText.sampleDate} onChangeText={v => updateEmailText('sampleDate', v)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Field label="Time Label" value={emailText.timeLabel} onChangeText={v => updateEmailText('timeLabel', v)} />
        </View>
        <View style={{ width: 140 }}>
          <Field label="Time Emoji" value={emailText.timeEmoji} onChangeText={v => updateEmailText('timeEmoji', v)} />
        </View>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Field label="Preview Time" value={emailText.sampleTime} onChangeText={v => updateEmailText('sampleTime', v)} />
        </View>
      </View>
      <Field label="At-Time Body Text" value={emailText.atTimeBody} onChangeText={v => updateEmailText('atTimeBody', v)} multiline />
      <Field label="Reminder Body Text" value={emailText.reminderBody} onChangeText={v => updateEmailText('reminderBody', v)} multiline />
      <Field label="Footer Text" value={footerText} onChangeText={setFooterText} multiline />
      <Field label="Contact Line" value={emailText.contactLine} onChangeText={v => updateEmailText('contactLine', v)} multiline />

      <Btn label={saving ? 'Saving…' : '💾 Save Email Config'} onPress={save} disabled={saving} />

      {/* Floating live preview window */}
      {previewOpen && (isNarrow ? (
        <Modal transparent visible animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
          <View style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 14,
            paddingVertical: 58,
            backgroundColor: 'rgba(0,0,0,0.62)',
          }}>
            <View style={{
              width: '100%',
              maxWidth: 420,
              alignSelf: 'center',
              maxHeight: '86%',
              backgroundColor: '#11111f',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: accentColor + '88',
              overflow: 'hidden',
            } as any}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>📧 Email Preview</Text>
                  <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Updates live while this window stays open</Text>
                </View>
                <Pressable onPress={() => setPreviewOpen(false)} style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.bgCard, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12 }}>✕ Close</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 12 }}>
                <EmailMiniPreview headerColor={headerColor} accentColor={accentColor} footerText={footerText} text={emailText} compact />
                <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 14, textAlign: 'center', lineHeight: 16 }}>
                  At-time: {subjectTask.replace('{{title}}', emailText.sampleTitle)}{'\n'}
                  Reminder: {subjectRem.replace('{{title}}', emailText.sampleTitle)}
                </Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : (
          <View style={{
            position: 'absolute',
            right: 0,
            top: 54,
            width: '44%',
            minWidth: 420,
            maxWidth: 760,
            maxHeight: 420,
            backgroundColor: '#11111f',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: accentColor + '88',
            overflow: 'hidden',
            zIndex: 30,
            boxShadow: Platform.OS === 'web' ? '0 24px 70px rgba(0,0,0,0.45)' : undefined,
          } as any}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>📧 Email Preview</Text>
                <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Updates live while this window stays open</Text>
              </View>
              <Pressable onPress={() => setPreviewOpen(false)} style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.bgCard, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12 }}>✕ Close</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 356 }} contentContainerStyle={{ padding: 18 }}>
              <EmailMiniPreview headerColor={headerColor} accentColor={accentColor} footerText={footerText} text={emailText} compact />
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 14, textAlign: 'center', lineHeight: 16 }}>
                At-time: {subjectTask.replace('{{title}}', emailText.sampleTitle)}{'\n'}
                Reminder: {subjectRem.replace('{{title}}', emailText.sampleTitle)}
              </Text>
            </ScrollView>
          </View>
      ))}
      </View>
    </AccordionCard>
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
    <AccordionCard title="⚙️ App Settings" subtitle="Links displayed inside the app">
      <Field label="Deep Work Blueprint Link" value={blueprint} onChangeText={setBlueprint} placeholder="https://…" />
      <Field label="Audio Player Link (Focus page)" value={audio} onChangeText={setAudio} placeholder="https://…" />
      <Btn label={saving ? 'Saving…' : '💾 Save Settings'} onPress={save} disabled={saving} />
    </AccordionCard>
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

  const MAX_UPLOAD_MB = 100; // Supabase storage default limit

  async function pickHowToVideo() {
    if (Platform.OS === 'web') {
      const file = await pickFileWeb('video/mp4,video/quicktime,video/webm,video/*');
      if (!file) return;
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > MAX_UPLOAD_MB) {
        Alert.alert(
          'File too large',
          `${Math.round(sizeMB)}MB exceeds the ${MAX_UPLOAD_MB}MB upload limit.\n\nFor large videos, upload to Google Drive or YouTube and paste the share/embed link in the URL field below.`
        );
        return;
      }
      setUploadingVideo(true);
      try {
        const url = await uploadFileToStorage(file, 'videos');
        setVideoUrl(url);
        // Auto-save immediately so Dashboard shows the video without needing Save button
        await onSave('howto_video_url', url);
        Alert.alert('Saved', 'Video uploaded and saved. It is now live on the Dashboard.');
      } catch (e: any) {
        Alert.alert('Upload failed', e.message);
      } finally { setUploadingVideo(false); }
      return;
    }
    // Native: use DocumentPicker
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['video/mp4', 'video/quicktime', 'video/webm'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingVideo(true);
      const url = await uploadResourceFile(
        { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'video/mp4' },
        'videos',
      );
      setVideoUrl(url);
      await onSave('howto_video_url', url);
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
    <AccordionCard title="🎬 How To Video Card" subtitle="Shown as an inline player on the Dashboard — not downloadable by users">
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
        <Text style={s.fieldLabel}>— OR PASTE VIDEO LINK (RECOMMENDED FOR LARGE FILES) —</Text>
        <TextInput
          style={s.input}
          value={videoUrl}
          onChangeText={setVideoUrl}
          placeholder="https://drive.google.com/file/d/…/view"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
          Google Drive, YouTube embed, Vimeo, or any direct video link. No size limit.
        </Text>
        <Text style={{ fontSize: 10, color: '#FB923C', marginTop: 2 }}>
          ⚠️ Google Drive: Right-click file → Share → "Anyone with the link" → Copy link
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
    </AccordionCard>
  );
}

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

  const active = cards.filter(c => c.is_active);

  return (
    <View>
      <Text style={liveCardStyles.previewLabel}>LIVE PREVIEW — AS USERS SEE IT</Text>
      <View style={liveCardStyles.grid}>
        {active.length > 0
          ? active.map(card => <LiveResourceCard key={card.id} card={card} cardWidth={cardWidth} />)
          : <Text style={liveCardStyles.emptyText}>No active resource cards are configured.</Text>}
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
  emptyText:   { fontSize: 13, color: colors.textSecondary },
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
    const MAX_MB = 100;
    if (Platform.OS === 'web') {
      const file = await pickFileWeb('video/mp4,video/quicktime,video/webm,video/*,application/pdf,.pdf,.pptx,.ppt,.docx,.doc,*/*');
      if (!file) return;
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > MAX_MB) {
        Alert.alert(
          'File too large',
          `${Math.round(sizeMB)}MB exceeds the ${MAX_MB}MB upload limit.\n\nFor large videos, upload to Google Drive or YouTube and paste the share/embed link in the URL field below.`
        );
        return;
      }
      setUploadingDeck(true);
      try {
        const folder = file.type.startsWith('video/') ? 'videos' : 'slide-decks';
        const url = await uploadFileToStorage(file, folder);
        set('slide_deck_url', url);
        // Auto-save immediately so users see the file without needing Save Card click
        await updateResourceCard(card.id, { slide_deck_url: url });
        Alert.alert('Saved', 'File uploaded and saved. Users can now view it.');
      } catch (e: any) {
        Alert.alert('Upload failed', e.message);
      } finally { setUploadingDeck(false); }
      return;
    }
    // Native
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['*/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingDeck(true);
      const mime = asset.mimeType ?? 'application/octet-stream';
      const folder = mime.startsWith('video/') ? 'videos' : 'slide-decks';
      const url = await uploadResourceFile({ uri: asset.uri, name: asset.name, type: mime }, folder);
      set('slide_deck_url', url);
      await updateResourceCard(card.id, { slide_deck_url: url });
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
                <Text style={inlineStyles.deckBadgeText}>
                  {(card.slide_deck_url.includes('drive.google.com') ||
                    /\.(mp4|mov|webm)/i.test(card.slide_deck_url) ||
                    card.slide_deck_url.includes('/video/') ||
                    card.slide_deck_url.includes('videos/'))
                    ? '🎬 Video' : '📎 Deck'}
                </Text>
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
              Upload files up to 100MB, or paste a Google Drive share link for large videos (free, no size limit).
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
                <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }}>— or paste a Google Drive / YouTube link below —</Text>
                <TextInput
                  style={s.input}
                  value={draft.slide_deck_url ?? ''}
                  onChangeText={v => set('slide_deck_url', v || null)}
                  placeholder="https://drive.google.com/file/d/…/view"
                  placeholderTextColor={colors.textTertiary}
                />
                <Text style={{ fontSize: 10, color: '#FB923C', marginTop: 2 }}>
                  ⚠️ Google Drive: Right-click file → Share → "Anyone with the link" → Copy link
                </Text>
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
    const MAX_MB = 100;
    if (Platform.OS === 'web') {
      const file = await pickFileWeb('video/mp4,video/quicktime,video/webm,video/*,application/pdf,.pdf,.pptx,.ppt,.docx,.doc,*/*');
      if (!file) return;
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > MAX_MB) {
        Alert.alert(
          'File too large',
          `${Math.round(sizeMB)}MB exceeds the ${MAX_MB}MB upload limit.\n\nFor large videos, upload to Google Drive or YouTube and paste the share/embed link in the URL field below.`
        );
        return;
      }
      setUploadingDeck(true);
      try {
        const folder = file.type.startsWith('video/') ? 'videos' : 'slide-decks';
        const url = await uploadFileToStorage(file, folder);
        set('slide_deck_url', url);
      } catch (e: any) { Alert.alert('Upload failed', e.message); }
      finally { setUploadingDeck(false); }
      return;
    }
    // Native
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['*/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingDeck(true);
      const mime = asset.mimeType ?? 'application/octet-stream';
      const folder = mime.startsWith('video/') ? 'videos' : 'slide-decks';
      const url = await uploadResourceFile({ uri: asset.uri, name: asset.name, type: mime }, folder);
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
            <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }}>— or paste a Google Drive / YouTube link below —</Text>
            <TextInput
              style={s.input}
              value={draft.slide_deck_url ?? ''}
              onChangeText={v => set('slide_deck_url', v || null)}
              placeholder="https://drive.google.com/file/d/…/view"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={{ fontSize: 10, color: '#FB923C', marginTop: 2 }}>
              ⚠️ Google Drive: Right-click file → Share → "Anyone with the link" → Copy link
            </Text>
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

// ─── Supercharge Routine CTA Card Editor ──────────────────────────────────────

function CTACardSection({
  settings, onSave,
}: {
  settings: Record<string, string>;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [icon,        setIcon]        = useState(settings['cta_icon']        ?? '🚀');
  const [title,       setTitle]       = useState(settings['cta_title']       ?? 'Supercharge Routine');
  const [desc,        setDesc]        = useState(settings['cta_desc']        ?? 'Stop leaving focus on the table. Automate your daily routines and ADHD strategy inside one view.');
  const [btnText,     setBtnText]     = useState(settings['cta_button_text'] ?? 'Explore Automations');
  const [btnColor,    setBtnColor]    = useState(settings['cta_button_color']?? '#4A90E2');
  const [link,        setLink]        = useState(settings['cta_link']        ?? '/(app)/resources');
  const [isInternal,  setIsInternal]  = useState((settings['cta_is_internal'] ?? 'true') === 'true');
  const [saving,      setSaving]      = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('cta_icon',         icon),
        onSave('cta_title',        title),
        onSave('cta_desc',         desc),
        onSave('cta_button_text',  btnText),
        onSave('cta_button_color', btnColor),
        onSave('cta_link',         link),
        onSave('cta_is_internal',  isInternal ? 'true' : 'false'),
      ]);
      Alert.alert('Saved', 'Supercharge Routine card updated.');
    } finally { setSaving(false); }
  }

  return (
    <AccordionCard title="🚀 Supercharge Routine Card" subtitle="The promotional banner on the Dashboard">
      <Field label="Icon (emoji)" value={icon} onChangeText={setIcon} placeholder="🚀" />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Supercharge Routine" />
      <Field label="Description" value={desc} onChangeText={setDesc} multiline placeholder="Stop leaving focus on the table…" />
      <Field label="Button Text" value={btnText} onChangeText={setBtnText} placeholder="Explore Automations" />
      <Field label="Button Color (hex)" value={btnColor} onChangeText={setBtnColor} placeholder="#4A90E2" />
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>LINK DESTINATION</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setIsInternal(true)}
            style={[s.btn, { flex: 1, backgroundColor: isInternal ? NF_BLUE : 'transparent', borderWidth: 1, borderColor: isInternal ? NF_BLUE : colors.border }]}
          >
            <Text style={{ color: isInternal ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>Internal Page</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsInternal(false)}
            style={[s.btn, { flex: 1, backgroundColor: !isInternal ? NF_ORANGE : 'transparent', borderWidth: 1, borderColor: !isInternal ? NF_ORANGE : colors.border }]}
          >
            <Text style={{ color: !isInternal ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>External URL</Text>
          </Pressable>
        </View>
        <TextInput
          style={s.input}
          value={link}
          onChangeText={setLink}
          placeholder={isInternal ? '/(app)/resources' : 'https://affiliate-link.com'}
          placeholderTextColor={colors.textTertiary}
        />
        {isInternal && (
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>
            Internal paths: /(app)/resources  ·  /(app)/focus  ·  /(app)/calendar
          </Text>
        )}
      </View>
      <Btn label={saving ? 'Saving…' : '💾 Save CTA Card'} onPress={save} disabled={saving} />
    </AccordionCard>
  );
}

// ─── Featured Affiliate Sidebar Card Editor ────────────────────────────────────

function AffiliateSection({
  settings, onSave,
}: {
  settings: Record<string, string>;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [visible,  setVisible]  = useState((settings['affiliate_visible'] ?? 'false') === 'true');
  const [icon,     setIcon]     = useState(settings['affiliate_icon']    ?? '⚡');
  const [title,    setTitle]    = useState(settings['affiliate_title']   ?? 'Featured Affiliate');
  const [sub,      setSub]      = useState(settings['affiliate_sub']     ?? 'Supercharge your focus flow');
  const [link,     setLink]     = useState(settings['affiliate_link']    ?? '');
  const [badge,    setBadge]    = useState(settings['affiliate_badge']   ?? '');
  const [saving,   setSaving]   = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('affiliate_visible', visible ? 'true' : 'false'),
        onSave('affiliate_icon',    icon),
        onSave('affiliate_title',   title),
        onSave('affiliate_sub',     sub),
        onSave('affiliate_link',    link),
        onSave('affiliate_badge',   badge),
      ]);
      Alert.alert('Saved', `Featured Affiliate ${visible ? 'is now visible in the sidebar' : 'is hidden from users'}.`);
    } finally { setSaving(false); }
  }

  return (
    <AccordionCard title="⚡ Featured Affiliate (Sidebar)" subtitle="Affiliate card in the left sidebar — toggle to show/hide from users">

      <View style={s.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>SHOW IN SIDEBAR</Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
            {visible ? '✅ Visible to all users' : '🔒 Hidden from users (only you can see it in Admin)'}
          </Text>
        </View>
        <Switch
          value={visible}
          onValueChange={setVisible}
          trackColor={{ false: colors.border, true: NF_GREEN }}
          thumbColor="#fff"
        />
      </View>

      <Field label="Icon (emoji or letter)" value={icon} onChangeText={setIcon} placeholder="⚡" />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Featured Affiliate" />
      <Field label="Subtitle / Tagline" value={sub} onChangeText={setSub} placeholder="Supercharge your focus flow" />
      <Field label="Badge Label (optional, e.g. 'New' or 'Hot')" value={badge} onChangeText={setBadge} placeholder="Soon" />
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>AFFILIATE LINK (EXTERNAL ONLY)</Text>
        <TextInput
          style={s.input}
          value={link}
          onChangeText={setLink}
          placeholder="https://your-affiliate-link.com"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          keyboardType="url"
        />
        <Text style={{ fontSize: 10, color: NF_ORANGE, marginTop: 2 }}>
          ⚠️ Must be a full external URL. Leave blank to show as non-clickable.
        </Text>
      </View>
      <Btn label={saving ? 'Saving…' : '💾 Save Affiliate Card'} onPress={save} disabled={saving} />
    </AccordionCard>
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
      setCards(fetched);
    } catch {
      setCards([]);
    } finally { setLoading(false); }
  }, []);

  // Silent refresh — no spinner, updates cards in place so User View stays visible
  const silentRefresh = useCallback(async () => {
    try {
      const fetched = await fetchAllResourceCards();
      setCards(fetched);
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
    <AccordionCard title="🗂 Resources Manager" subtitle="Tap ✏️ on any card to edit inline">
      <Pressable
        onPress={() => setShowPreview(p => !p)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          backgroundColor: showPreview ? NF_BLUE + '22' : colors.bgBase,
          borderWidth: 1, borderColor: showPreview ? NF_BLUE : colors.border,
          borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: showPreview ? NF_BLUE : colors.textSecondary }}>
          {showPreview ? '✕ Close Preview' : '👁 User View'}
        </Text>
      </Pressable>

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
    </AccordionCard>
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
  const [users,       setUsers]       = useState<UserRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showLeads,   setShowLeads]   = useState(false);

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

  const adminUser  = users.find(u => u.email?.toLowerCase() === ADMIN_EMAIL);
  const otherUsers = users.filter(u => u.email?.toLowerCase() !== ADMIN_EMAIL);
  const activeCount = otherUsers.filter(u => u.onboarded === true).length;

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <AccordionCard
      title={`👥 User Monitor`}
      subtitle={`${otherUsers.length} registered users · ${activeCount} active`}
    >
      {loading && <ActivityIndicator color={NF_BLUE} style={{ marginVertical: 12 }} />}

      {!loading && (
        <>
          {/* ── Admin row ── */}
          <View style={{ backgroundColor: NF_BLUE + '12', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: NF_BLUE + '33' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: NF_BLUE, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>🛡️ Admin Account</Text>
            {adminUser ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[s.userAvatar, { backgroundColor: NF_BLUE }]}>
                  <Text style={s.userAvatarText}>A</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.userName}>{adminUser.display_name ?? 'Essential Life Kits'}</Text>
                  <Text style={s.userEmail}>{adminUser.email}</Text>
                  <Text style={s.userSince}>Joined {fmtDate(adminUser.created_at)}</Text>
                </View>
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <View style={s.activeDotWrap}><View style={s.activeDotGlow} /><View style={s.activeDot} /></View>
                  <Text style={s.activeLabel}>Active</Text>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: NF_BLUE }}>essentiallifekits@gmail.com · Active</Text>
            )}
          </View>

          {/* ── User count summary ── */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: NF_GREEN + '12', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: NF_GREEN + '33', alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: NF_GREEN }}>{activeCount}</Text>
              <Text style={{ fontSize: 11, color: NF_GREEN, fontWeight: '700', marginTop: 2 }}>ACTIVE USERS</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.bgBase, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary }}>{otherUsers.length}</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '700', marginTop: 2 }}>TOTAL USERS</Text>
            </View>
          </View>

          {/* ── Lead capture list (hidden until toggled) ── */}
          <Pressable
            onPress={() => setShowLeads(l => !l)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.bgBase, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
              📋 Lead List ({otherUsers.length} contacts)
            </Text>
            <Text style={{ fontSize: 13, color: NF_BLUE }}>{showLeads ? '▾ Hide' : '▸ Reveal'}</Text>
          </Pressable>

          {showLeads && (
            <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled showsVerticalScrollIndicator>
              {otherUsers.length === 0 && (
                <Text style={[s.emptyText, { padding: 12 }]}>No users yet.</Text>
              )}
              {otherUsers.map((u, idx) => (
                <View key={u.id} style={[s.userRow, idx === otherUsers.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={s.userAvatar}>
                    <Text style={s.userAvatarText}>{(u.display_name ?? u.email)?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.userName}>{u.display_name ?? '—'}</Text>
                    <Text style={s.userEmail}>{u.email}</Text>
                    <Text style={s.userSince}>Joined {fmtDate(u.created_at)}</Text>
                  </View>
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    {u.onboarded ? (
                      <><View style={s.activeDotWrap}><View style={s.activeDotGlow} /><View style={s.activeDot} /></View><Text style={s.activeLabel}>Active</Text></>
                    ) : (
                      <><View style={s.pendingDot} /><Text style={s.pendingLabel}>Pending</Text></>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </AccordionCard>
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

  useEffect(() => {
    if (user !== undefined && !isAdmin) {
      router.replace('/(app)');
    }
  }, [user, isAdmin]);

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
            <HowToVideoSection settings={settings} onSave={handleSaveSetting} />
            <CTACardSection settings={settings} onSave={handleSaveSetting} />
            <AffiliateSection settings={settings} onSave={handleSaveSetting} />
            <ResourcesSection />
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
