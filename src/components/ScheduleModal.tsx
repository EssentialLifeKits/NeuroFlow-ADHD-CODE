import React, { useEffect, useState, useRef } from 'react';
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

import { colors, radius, spacing, typography } from '../constants/theme';
import { type Task } from '../lib/db';
import { useTasks } from '../lib/TasksContext';
import { useAuth } from '../lib/auth';
import {
  type ADHDCategory,
  ADHD_CATEGORIES,
  BEST_TIMES,
  displayTo24,
} from '../lib/tasksUtils';

const NF_BLUE = '#4A90E2';
const NF_BLUE_GLOW = 'rgba(74, 144, 226, 0.28)';
const DESKTOP_BREAKPOINT = 1024;
const DESKTOP_SIDEBAR_W = 240;

// ─── Native HTML Video Player (Web) ─────────────────────────────────────────
// On web, expo-av wraps <video> in ways that hide the native timeline.
// Using React.createElement to render a raw <video> tag gives us the EXACT
// same native player as the example screenshot: play, timeline scrubber,
// timer, volume, fullscreen, and 3-dot menu.
function NativeWebVideo({
  uri,
  videoElRef,
  onTimeUpdate,
  style,
}: {
  uri: string;
  videoElRef?: React.RefObject<any>;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  style?: any;
}) {
  if (Platform.OS !== 'web') {
    // Fallback for native: use expo-av
    return (
      <Video
        ref={videoElRef}
        source={{ uri }}
        style={style || { flex: 1, width: '100%', height: '100%' }}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        onPlaybackStatusUpdate={(s: any) => {
          if (s.isLoaded && onTimeUpdate) {
            onTimeUpdate(s.positionMillis, s.durationMillis || 1);
          }
        }}
      />
    );
  }

  // On web: render a raw HTML <video> element
  return React.createElement('video', {
    ref: videoElRef,
    src: uri,
    controls: true,
    controlsList: '',
    playsInline: true,
    preload: 'metadata',
    onTimeUpdate: (e: any) => {
      if (onTimeUpdate) {
        onTimeUpdate(
          (e.target.currentTime || 0) * 1000,
          (e.target.duration || 1) * 1000
        );
      }
    },
    onSeeking: () => {
      if ((onTimeUpdate as any)?._onScrubStart) (onTimeUpdate as any)._onScrubStart();
    },
    onSeeked: () => {
      if ((onTimeUpdate as any)?._onScrubEnd) (onTimeUpdate as any)._onScrubEnd();
    },
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      backgroundColor: '#000',
      borderRadius: 8,
      outline: 'none',
      ...(style || {}),
    },
  });
}

// ─── Strip UUID / hash prefixes from file names ──────────────────────────────
function cleanFileName(raw: string): string {
  // Remove leading UUID-like prefixes (8-4-4-4-12 pattern) followed by optional separators
  let cleaned = raw.replace(/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}[-_.\s]*/g, '');
  // Also remove leading hex hash prefixes (32+ chars) followed by separators
  cleaned = cleaned.replace(/^[0-9A-Fa-f]{20,}[-_.\s]*/g, '');
  // Remove any leading timestamp-like prefixes (e.g., 1773250352492-)
  cleaned = cleaned.replace(/^\d{10,}[-_.\s]*/g, '');
  return cleaned || raw; // Fallback to the original if everything was stripped
}

// ─── Uploaded File / Lightbox state ──────────────────────────────────────────
export interface AttachedFile {
  uri: string; name: string; mimeType?: string; type: 'image' | 'document' | 'video';
  width?: number; height?: number;
}
export interface LightboxState { visible: boolean; file: AttachedFile | null; }

// ─── Schedule Modal ───────────────────────────────────────────────────────────
export interface ScheduleEntry {
  taskDetails: string; date: string; time: string;
  tags: string; category: ADHDCategory; status: 'scheduled' | 'draft';
}

function CategoryButton({ itemKey, conf, active, onPress }: { itemKey: string; conf: any; active: boolean; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isHighlighted = active || hovered;

  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={[ms.catBtn, isHighlighted && { borderColor: conf.color, backgroundColor: conf.color + '15' }]}
    >
      <Text style={ms.catEmoji}>{conf.emoji}</Text>
      <Text style={[ms.catLabel, isHighlighted && { color: conf.color }]}>{conf.label}</Text>
    </Pressable>
  );
}

export default function ScheduleModal({
  visible, selectedDate, onClose, initialData, onToast,
}: {
  visible: boolean; selectedDate: string | null;
  onClose: () => void;
  initialData?: Task | null; onToast?: () => void;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width > DESKTOP_BREAKPOINT;

  const { addTask, editTask } = useTasks();
  const { user } = useAuth();

  const [taskDetails, setTaskDetails] = useState('');
  const [tags, setTags] = useState('');
  const [reminderOffset, setReminderOffset] = useState<'none' | '1h_before' | '1d_before'>('none');
  const [category, setCategory] = useState<ADHDCategory>('task');
  const [detailsFocused, setDetailsFocused] = useState(false);
  const [selectedChipTime, setSelectedChipTime] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [uploadFocused, setUploadFocused] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [videoPosition, setVideoPosition] = useState(0);
  const [videoDuration, setVideoDuration] = useState(1);
  const videoRef = useRef<any>(null);
  const [thumbnailTime, setThumbnailTime] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const scrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [capturedThumbnail, setCapturedThumbnail] = useState<string | null>(null);
  const [scheduleHovered, setScheduleHovered] = useState(false);
  const [draftHovered, setDraftHovered] = useState(false);
  const [thumbnailCaptured, setThumbnailCaptured] = useState(false);
  const captureToastAnim = useRef(new Animated.Value(0)).current;
  const captureToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireCaptureToast = () => {
    setThumbnailCaptured(true);
    Animated.sequence([
      Animated.timing(captureToastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(captureToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setThumbnailCaptured(false));
  };
  const [lightbox, setLightbox] = useState<LightboxState>({ visible: false, file: null });

  const initDate = () => selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
  const [pickedDate, setPickedDate] = useState<Date>(initDate);
  const [pickedTime, setPickedTime] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const prevVisibleRef = useRef(false);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;
    // Only initialise form state when modal opens (false → true), never while already open
    if (!visible || wasVisible) return;

    if (initialData) {
      setTaskDetails(initialData.title ?? '');
      setTags(initialData.description ?? '');
      const cat = (initialData.chore_category?.toLowerCase() ?? 'task') as ADHDCategory;
      setCategory(ADHD_CATEGORIES[cat] ? cat : 'task');
      const ro = initialData.recurrence_rule;
      setReminderOffset((['none','at_time','1h_before','1d_before'].includes(ro ?? '') ? ro : 'none') as any);
      setDetailsFocused(false);
      setSelectedChipTime(null);
      setAttachedFile(null);
      if (initialData.due_date) setPickedDate(new Date(initialData.due_date + 'T00:00:00'));
      else setPickedDate(initDate());
      if (initialData.due_time) {
        const d = new Date();
        const [h, m] = initialData.due_time.split(':').map(Number);
        d.setHours(h, m, 0, 0);
        setPickedTime(d);
      } else setPickedTime(new Date());

      if (initialData.sticker_id && initialData.sticker_id.startsWith('{')) {
        try {
          const p = JSON.parse(initialData.sticker_id);
          setAttachedFile({ uri: p.uri || p.thumbnail || '', type: p.type, name: p.name || 'media', width: p.width, height: p.height });
          setThumbnailTime(p.thumbTime ?? null);
          setCapturedThumbnail(p.thumbnail ?? null);
        } catch {}
      }
    } else {
      setTaskDetails(''); setTags(''); setCategory('task'); setReminderOffset('none');
      setDetailsFocused(false); setSelectedChipTime(null); setAttachedFile(null); setUploadSuccess(false);
      setThumbnailTime(null); setCapturedThumbnail(null);
      setPickedDate(initDate()); setPickedTime(new Date());
    }
  }, [visible, selectedDate, initialData]);

  const handleClose = () => { onClose(); };

  const handleSchedule = async () => {
    if (!taskDetails.trim()) return;
    const dateStr = [
      pickedDate.getFullYear(),
      String(pickedDate.getMonth() + 1).padStart(2, '0'),
      String(pickedDate.getDate()).padStart(2, '0'),
    ].join('-');
    const timeStr = `${String(pickedTime.getHours()).padStart(2, '0')}:${String(pickedTime.getMinutes()).padStart(2, '0')}`;
    
    // Build compact sticker_id:
    // - video: store only the canvas-captured thumbnail JPEG (not the blob URL, which expires)
    // - document: store base64 only if ≤ 400 KB to avoid DB column truncation
    // - image: store base64 URI as before
    let sticker_id: string | null = null;
    if (attachedFile) {
      if (attachedFile.type === 'video') {
        sticker_id = JSON.stringify({
          type: 'video',
          thumbnail: capturedThumbnail,   // canvas-captured JPEG frame (persists)
          thumbTime: thumbnailTime,
          name: attachedFile.name,
        });
      } else if (attachedFile.type === 'document') {
        const MAX_DOC_CHARS = 400 * 1024; // ~300 KB base64 → safe for DB
        sticker_id = JSON.stringify({
          type: 'document',
          name: attachedFile.name,
          thumbTime: thumbnailTime,
          ...(attachedFile.uri && attachedFile.uri.length <= MAX_DOC_CHARS
            ? { uri: attachedFile.uri }
            : {}),
        });
      } else {
        sticker_id = JSON.stringify({
          uri: attachedFile.uri,
          type: attachedFile.type,
          width: attachedFile.width,
          height: attachedFile.height,
          thumbTime: thumbnailTime,
        });
      }
    }

    const taskInput = {
      title: taskDetails.trim(),
      description: tags.trim() || null,
      view_type: 'daily',
      status: 'pending',
      priority: 1,
      due_date: dateStr,
      due_time: timeStr,
      chore_category: category,
      sticker_id: sticker_id,
      recurrence_rule: reminderOffset, // store reminder offset in recurrence_rule column
    };

    try {
      if (initialData?.id) { await editTask(initialData.id, taskInput); }
      else { await addTask(taskInput); }
    } catch (saveErr: any) {
      Alert.alert(
        '❌ Entry Not Saved',
        `Could not save to the database: ${saveErr?.message ?? 'Unknown error'}. Please check your connection and try again.`,
      );
      return;
    }

    // Schedule email reminder via Resend (skips InsForge entirely)
    if (user?.email && reminderOffset !== 'none') {
      try {
        await fetch('/api/schedule-reminder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: taskDetails.trim(),
            dueDate: dateStr,
            dueTime: timeStr,
            category,
            userName: (user as any).displayName || user.email,
            email: user.email,
            reminderOffset,
          }),
        });
      } catch (e) {
        console.warn('[ScheduleModal] schedule-reminder failed:', e);
      }
    }

    handleClose();
    if (onToast) onToast();
    Alert.alert(
      '✅ Entry Saved!',
      initialData ? 'Your entry has been updated and synced.' : 'Your entry is now scheduled and active.',
    );
  };

  const handleDraft = async () => {
    const dateStr = [
      pickedDate.getFullYear(),
      String(pickedDate.getMonth() + 1).padStart(2, '0'),
      String(pickedDate.getDate()).padStart(2, '0'),
    ].join('-');
    const timeStr = `${String(pickedTime.getHours()).padStart(2, '0')}:${String(pickedTime.getMinutes()).padStart(2, '0')}`;
    
    const sticker_id = attachedFile ? JSON.stringify({
      uri: attachedFile.uri,
      type: attachedFile.type,
      width: attachedFile.width,
      height: attachedFile.height,
      thumbTime: thumbnailTime
    }) : null;

    const taskInput = {
      title: taskDetails.trim() || 'Untitled draft',
      description: tags || null,
      view_type: 'daily',
      status: 'draft',
      priority: 1,
      due_date: dateStr,
      due_time: timeStr,
      chore_category: category,
      sticker_id: sticker_id,
      recurrence_rule: reminderOffset,
    };

    try {
      if (initialData?.id) { await editTask(initialData.id, taskInput); }
      else { await addTask(taskInput); }
    } catch (saveErr: any) {
      Alert.alert(
        '❌ Draft Not Saved',
        `Could not save to the database: ${saveErr?.message ?? 'Unknown error'}. Please check your connection and try again.`,
      );
      return;
    }

    handleClose();
    Alert.alert(
      '📝 Draft Saved!',
      'Your draft is saved! Find it in the Drafts section on your Dashboard to continue editing anytime.',
    );
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video' || (asset.fileName ?? '').match(/\.(mp4|mov|avi|mkv)$/i);
      if (!isVideo && Platform.OS === 'web') {
        // Convert to base64 so thumbnail persists after re-login
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onload = (ev: any) => {
          setAttachedFile({
            uri: ev.target.result as string,
            name: cleanFileName(asset.fileName ?? 'image'),
            mimeType: asset.mimeType,
            type: 'image',
            width: asset.width,
            height: asset.height,
          });
          setUploadSuccess(true);
        };
        reader.readAsDataURL(blob);
      } else if (isVideo && Platform.OS === 'web') {
        // Use a blob URL for playback — base64 is too large for <video> elements.
        // Only the canvas-captured thumbnail frame is persisted to the DB.
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        setAttachedFile({
          uri: blobUrl,
          name: cleanFileName(asset.fileName ?? 'video'),
          mimeType: asset.mimeType,
          type: 'video',
          width: asset.width,
          height: asset.height,
        });
        setCapturedThumbnail(null);
        setUploadSuccess(true);
      } else {
        setAttachedFile({
          uri: asset.uri,
          name: cleanFileName(asset.fileName ?? 'media'),
          mimeType: asset.mimeType,
          type: isVideo ? 'video' : 'image',
          width: asset.width,
          height: asset.height,
        });
        setUploadSuccess(true);
      }
    }
  };

  const pickDocument = async () => {
    if (Platform.OS === 'web') {
      // Web: use a hidden <input type="file"> to avoid expo-image-picker's
      // "unsupported file type" error for PDFs and other document types
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.onchange = (e: any) => {
        const file: File = e.target.files?.[0];
        if (!file) return;
        const mime = file.type ?? '';
        const nm = file.name ?? '';
        const isVideo = mime.startsWith('video/') || /\.(mp4|mov|avi|mkv)$/i.test(nm);
        const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(nm);
        if (isImage) {
          // Convert image to base64 so thumbnail persists after re-login
          const reader = new FileReader();
          reader.onload = (ev: any) => {
            setAttachedFile({
              uri: ev.target.result as string,
              name: cleanFileName(nm),
              mimeType: mime,
              type: 'image',
            });
            setUploadSuccess(true);
          };
          reader.readAsDataURL(file);
        } else if (isVideo) {
          // Use a blob URL for playback — only the canvas thumbnail is persisted.
          const blobUrl = URL.createObjectURL(file);
          setAttachedFile({
            uri: blobUrl,
            name: cleanFileName(nm),
            mimeType: mime,
            type: 'video',
          });
          setCapturedThumbnail(null);
          setUploadSuccess(true);
        } else {
          // Convert document to base64 so the preview/thumbnail persists after re-login.
          // Blob URLs expire when the session ends.
          const reader = new FileReader();
          reader.onload = (ev: any) => {
            setAttachedFile({
              uri: ev.target.result as string,
              name: cleanFileName(nm),
              mimeType: mime,
              type: 'document',
            });
            setUploadSuccess(true);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
      return;
    }
    // Native: DocumentPicker supports all types natively
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      const mime = a.mimeType ?? '';
      const nm = a.name ?? '';
      const isVideo = mime.startsWith('video/') || /\.(mp4|mov|avi|mkv)$/i.test(nm);
      const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(nm);
      setAttachedFile({
        uri: a.uri,
        name: cleanFileName(nm),
        mimeType: a.mimeType,
        type: isVideo ? 'video' : isImage ? 'image' : 'document',
      });
      setUploadSuccess(true);
    }
  };

  const isValid = taskDetails.trim().length > 0;
  const catEntries = Object.entries(ADHD_CATEGORIES) as [ADHDCategory, typeof ADHD_CATEGORIES[ADHDCategory]][];
  const displayDateStr = pickedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const displayTimeStr = pickedTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  let dynamicRatio = 9 / 16;
  if (attachedFile?.width && attachedFile?.height) {
    dynamicRatio = attachedFile.width / attachedFile.height;
  } else if (attachedFile?.type === 'document') {
    dynamicRatio = 8.5 / 11;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={ms.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
        <View style={ms.sheet}>
          <View style={ms.header}>
            <View>
              <Text style={ms.headerTitle}>📅 Schedule Task</Text>
              {selectedDate ? <Text style={ms.headerSub}>{selectedDate}</Text> : null}
            </View>
            <Pressable onPress={handleClose} style={ms.closeBtn}>
              <Text style={ms.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={ms.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={isDesktop ? ms.desktopTwoColumn : ms.mobileSingleColumn}>
              
              {/* ─── LEFT COLUMN (Upload + Best Times) ─── */}
              <View style={isDesktop ? ms.desktopColLeft : {}}>
                {/* Attach Visual Cue */}
                <View style={[ms.formGroup, isDesktop && { flex: 1 }]}>
                  <Text style={ms.formLabel}>ATTACH VISUAL CUE / DOCUMENT</Text>
                  {/* Upload success banner */}
                  {uploadSuccess && attachedFile && (
                    <View style={ms.uploadSuccessBanner}>
                      <Text style={ms.uploadSuccessText}>✅ {attachedFile.name} attached!</Text>
                      <Pressable onPress={() => { setAttachedFile(null); setUploadSuccess(false); }} style={ms.uploadAnotherBtn}>
                        <Text style={ms.uploadAnotherText}>Upload Another</Text>
                      </Pressable>
                    </View>
                  )}
                  {attachedFile ? (
                    <View style={[
                      ms.filePreview,
                      attachedFile.type === 'document'
                        ? { minHeight: 420, width: '100%' }
                        : [ms.portraitContainer, { aspectRatio: dynamicRatio }],
                    ]}>
                      {attachedFile.type === 'image' ? (
                        <TouchableOpacity onPress={() => setLightbox({ visible: true, file: attachedFile })} activeOpacity={0.85} style={{ flex: 1 }}>
                          <Image source={{ uri: attachedFile.uri }} style={[ms.fileImage, { height: '100%' }]} resizeMode="cover" />
                          <TouchableOpacity onPress={() => { setThumbnailTime(0); fireCaptureToast(); }} style={ms.thumbBtnTop} activeOpacity={0.85}>
                            <Text style={ms.thumbBtnText}>📸 Set as Thumbnail</Text>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ) : attachedFile.type === 'video' ? (
                        (() => {
                          // A blob: URI means a freshly-uploaded video (playable).
                          // Anything else (e.g. data:image/ from sticker_id) means stored-thumbnail-only.
                          const isPlayable = attachedFile.uri.startsWith('blob:') || attachedFile.uri.startsWith('data:video/');
                          if (!isPlayable) {
                            // Stored entry: show captured thumbnail or placeholder
                            return (
                              <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                                {capturedThumbnail ? (
                                  <Image source={{ uri: capturedThumbnail }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                ) : (
                                  <Text style={{ fontSize: 48 }}>🎬</Text>
                                )}
                                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.75)', padding: 10, alignItems: 'center' }}>
                                  <Text style={{ color: '#ccc', fontSize: 11, fontWeight: '600' }}>Re-upload to replace video</Text>
                                </View>
                              </View>
                            );
                          }
                          return (
                            <View style={{ flex: 1, backgroundColor: '#000', position: 'relative' }}>
                              {/* Capture Scene Button — visible when scrubbing */}
                              {isScrubbing && (
                                <TouchableOpacity
                                  onPress={() => {
                                    if (Platform.OS === 'web' && videoRef.current) {
                                      // Canvas-capture the current video frame as a JPEG
                                      const vid = videoRef.current as HTMLVideoElement;
                                      const canvas = document.createElement('canvas');
                                      canvas.width = vid.videoWidth || 320;
                                      canvas.height = vid.videoHeight || 180;
                                      const ctx = canvas.getContext('2d');
                                      if (ctx) {
                                        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
                                        setCapturedThumbnail(canvas.toDataURL('image/jpeg', 0.7));
                                      }
                                      const ct = (vid.currentTime || 0) * 1000;
                                      setThumbnailTime(ct);
                                      setVideoPosition(ct);
                                    } else {
                                      setThumbnailTime(videoPosition);
                                    }
                                    setIsScrubbing(false);
                                    fireCaptureToast();
                                  }}
                                  style={ms.thumbBtnTop}
                                  activeOpacity={0.85}
                                >
                                  <Text style={ms.thumbBtnText}>📸 Capture This Scene</Text>
                                </TouchableOpacity>
                              )}

                              <NativeWebVideo
                                uri={attachedFile.uri}
                                videoElRef={videoRef}
                                onTimeUpdate={Object.assign(
                                  (posMs: number, durMs: number) => {
                                    setVideoPosition(posMs);
                                    if (durMs) setVideoDuration(durMs);
                                  },
                                  {
                                    _onScrubStart: () => {
                                      if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
                                      setIsScrubbing(true);
                                    },
                                    _onScrubEnd: () => {
                                      if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
                                      scrubTimerRef.current = setTimeout(() => {}, 5000);
                                    },
                                  }
                                )}
                              />
                            </View>
                          );
                        })()
                      ) : attachedFile.type === 'document' ? (
                        <View style={{ flex: 1, minHeight: 320 }}>
                          {Platform.OS === 'web' ? (
                            // Web: use iframe for ALL document types — browser handles PDF, images,
                            // text, HTML natively. For unsupported types the browser shows a download prompt.
                            attachedFile.uri ? (
                              <View style={{ flex: 1, position: 'relative', minHeight: 320 }}>
                                {React.createElement('iframe', {
                                  src: attachedFile.uri,
                                  title: attachedFile.name,
                                  style: {
                                    width: '100%',
                                    height: '100%',
                                    minHeight: 320,
                                    border: 'none',
                                    borderRadius: 8,
                                    backgroundColor: '#fff',
                                    display: 'block',
                                  },
                                })}
                                <TouchableOpacity
                                  onPress={() => { setThumbnailTime(0); fireCaptureToast(); }}
                                  style={ms.thumbBtnTop}
                                  activeOpacity={0.85}
                                >
                                  <Text style={ms.thumbBtnText}>📸 Capture as Thumbnail</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <View style={{ flex: 1, minHeight: 320, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 8 }}>
                                <Text style={{ fontSize: 48, marginBottom: 12 }}>📄</Text>
                                <Text style={{ color: '#ccc', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 }}>{attachedFile.name}</Text>
                                <Text style={{ color: '#888', fontSize: 12, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }}>Document saved. Re-upload to preview.</Text>
                                <TouchableOpacity
                                  onPress={() => { setThumbnailTime(0); fireCaptureToast(); }}
                                  style={[ms.thumbBtnTop, { position: 'relative', marginTop: 16 }]}
                                  activeOpacity={0.85}
                                >
                                  <Text style={ms.thumbBtnText}>📸 Set as Thumbnail</Text>
                                </TouchableOpacity>
                              </View>
                            )
                          ) : (
                            <TouchableOpacity onPress={() => setLightbox({ visible: true, file: attachedFile })} activeOpacity={0.85} style={{ flex: 1, justifyContent: 'center' }}>
                              <View style={[ms.docPreview, { flex: 1, justifyContent: 'center' }]}>
                                <Text style={ms.docIcon}>📄</Text>
                                <Text style={ms.docName} numberOfLines={2}>{attachedFile.name}</Text>
                                <Text style={ms.tapToView}>Tap to view full screen 🔍</Text>
                              </View>
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : null}
                      
                      <TouchableOpacity onPress={() => { setAttachedFile(null); setThumbnailTime(null); setCapturedThumbnail(null); }} style={ms.fileDeleteBtn}>
                        <Text style={ms.fileDeleteText}>🗑 Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Pressable
                      style={[ms.uploadZone, ms.portraitContainer, uploadFocused && ms.uploadZoneActive]}
                      onPress={() => setUploadFocused(true)}
                      onHoverIn={() => setUploadFocused(true)}
                      onHoverOut={() => setUploadFocused(false)}
                    >
                      <View style={ms.uploadInner}>
                        <Text style={ms.uploadIcon}>📥</Text>
                        <Text style={ms.uploadTitle}>Drop media here or click to upload</Text>
                        <Text style={ms.uploadHint}>Supports JPG, PNG, MP4 - Max 50MB</Text>
                        <View style={ms.uploadPill}>
                          <Text style={ms.uploadPillText}>9:16 Portrait (1080x1920)</Text>
                        </View>
                        <View style={ms.uploadBtnRow}>
                          <TouchableOpacity onPress={pickImage} style={ms.uploadBtn} activeOpacity={0.85}>
                            <Text style={ms.uploadBtnText}>📷 Photo / Video</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={pickDocument} style={ms.uploadBtn} activeOpacity={0.85}>
                            <Text style={ms.uploadBtnText}>📄 Document</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Pressable>
                  )}
                </View>

                {/* Best Times */}
                <View style={ms.formGroup}>
                  <View style={ms.timesHeader}>
                    <View style={ms.clockCircle}><Text style={ms.clockFace}>⏱</Text></View>
                    <Text style={ms.formLabel}>SUGGESTED TIMES</Text>
                  </View>
                  <View style={ms.chipRow}>
                    {BEST_TIMES.map((bt: any) => {
                      const active = selectedChipTime === bt.display;
                      return (
                        <Pressable
                          key={bt.display}
                          style={[ms.chip, active && ms.chipActive]}
                          onPress={() => {
                            setSelectedChipTime(bt.display);
                            const t24 = displayTo24(bt.display);
                            const [h, min] = t24.split(':').map(Number);
                            const d = new Date(); d.setHours(h, min, 0, 0);
                            setPickedTime(d);
                          }}
                        >
                          <Text style={[ms.chipText, active && ms.chipTextActive]}>{bt.display} {bt.engagement}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* ─── RIGHT COLUMN (Form Details) ─── */}
              <View style={isDesktop ? ms.desktopColRight : {}}>
                {/* Task Details */}
                <View style={[ms.formGroup, isDesktop && { flex: 1, minHeight: 200 }]}>
                  <Text style={ms.formLabel}>TASK DETAILS / BRAIN DUMP</Text>
                  <TextInput
                    style={[ms.textArea, isDesktop && { flex: 1 }, detailsFocused && ms.textAreaFocused]}
                    placeholderTextColor={colors.textTertiary}
                    placeholder="Write your task details here... Use line breaks and emojis to make it engaging!"
                    value={taskDetails}
                    onChangeText={setTaskDetails}
                    multiline numberOfLines={5} textAlignVertical="top"
                    onFocus={() => setDetailsFocused(true)}
                    onBlur={() => setDetailsFocused(false)}
                  />
                  <Text style={ms.charCount}>{taskDetails.length} / 2,200</Text>
                </View>

                {/* Date and Time Pickers */}
                <View style={ms.dateTimeRow}>
                  {/* Date Picker */}
                  <View style={[ms.formGroup, { flex: 1, marginBottom: 0 }]}>
                    <Text style={ms.formLabel}>DATE</Text>
                    {Platform.OS === 'web' ? (
                      React.createElement('input', {
                        type: 'date',
                        value: `${pickedDate.getFullYear()}-${String(pickedDate.getMonth() + 1).padStart(2, '0')}-${String(pickedDate.getDate()).padStart(2, '0')}`,
                        min: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
                        onChange: (e: any) => {
                          const d = new Date(e.target.value + 'T00:00:00');
                          if (!isNaN(d.getTime())) setPickedDate(d);
                        },
                        style: {
                          backgroundColor: '#1a1a26', border: '1px solid rgba(74,144,226,0.55)',
                          borderRadius: '8px', padding: '13px 14px', fontSize: '14px',
                          fontWeight: '600', color: '#f0f0f5', width: '100%',
                          cursor: 'pointer', outline: 'none', colorScheme: 'dark',
                          boxSizing: 'border-box',
                        },
                      })
                    ) : (
                      <>
                        <TouchableOpacity
                          style={ms.inputDisplay}
                          onPress={() => { setShowDatePicker(true); setShowTimePicker(false); }}
                          activeOpacity={0.8}
                        >
                          <Text style={ms.inputDisplayText}>📆 {displayDateStr}</Text>
                        </TouchableOpacity>
                        {showDatePicker && (
                          <DateTimePicker
                            value={pickedDate} mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={new Date()}
                            onChange={(_e: DateTimePickerEvent, d?: Date) => {
                              setShowDatePicker(Platform.OS === 'ios');
                              if (d) setPickedDate(d);
                            }}
                          />
                        )}
                        {Platform.OS === 'ios' && showDatePicker && (
                          <TouchableOpacity onPress={() => setShowDatePicker(false)} style={ms.pickerDoneBtn}>
                            <Text style={ms.pickerDoneText}>Done</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>

                  {/* Time Picker */}
                  <View style={[ms.formGroup, { flex: 1, marginBottom: 0 }]}>
                    <Text style={ms.formLabel}>TIME</Text>
                    {Platform.OS === 'web' ? (
                      React.createElement('input', {
                        type: 'time',
                        value: `${String(pickedTime.getHours()).padStart(2, '0')}:${String(pickedTime.getMinutes()).padStart(2, '0')}`,
                        onChange: (e: any) => {
                          const parts = e.target.value.split(':');
                          if (parts.length >= 2) {
                            const d = new Date(pickedTime);
                            d.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);
                            setPickedTime(d);
                            setSelectedChipTime(null);
                          }
                        },
                        style: {
                          backgroundColor: '#1a1a26', border: '1px solid rgba(74,144,226,0.55)',
                          borderRadius: '8px', padding: '13px 14px', fontSize: '14px',
                          fontWeight: '600', color: '#f0f0f5', width: '100%',
                          cursor: 'pointer', outline: 'none', colorScheme: 'dark',
                          boxSizing: 'border-box',
                        },
                      })
                    ) : (
                      <>
                        <TouchableOpacity
                          style={ms.inputDisplay}
                          onPress={() => { setShowTimePicker(true); setShowDatePicker(false); }}
                          activeOpacity={0.8}
                        >
                          <Text style={ms.inputDisplayText}>🕐 {displayTimeStr}</Text>
                        </TouchableOpacity>
                        {showTimePicker && (
                          <DateTimePicker
                            value={pickedTime} mode="time" is24Hour={false}
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(_e: DateTimePickerEvent, t?: Date) => {
                              setShowTimePicker(Platform.OS === 'ios');
                              if (t) { setPickedTime(t); setSelectedChipTime(null); }
                            }}
                          />
                        )}
                        {Platform.OS === 'ios' && showTimePicker && (
                          <TouchableOpacity onPress={() => setShowTimePicker(false)} style={ms.pickerDoneBtn}>
                            <Text style={ms.pickerDoneText}>Done</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                </View>

                {/* Spacer for mobile, handled by gap natively but let's add margin */}
                <View style={{ height: 18 }} />

                {/* Tags */}
                <View style={ms.formGroup}>
                  <Text style={ms.formLabel}>HASHTAGS / TAGS</Text>
                  <TextInput
                    style={ms.textInput}
                    placeholderTextColor={colors.textTertiary}
                    placeholder="#focus #productivity #content"
                    value={tags} onChangeText={setTags}
                  />
                </View>

                {/* Remind Me */}
                <View style={ms.formGroup}>
                  <Text style={ms.formLabel}>🔔 REMIND ME</Text>
                  <View style={ms.reminderRow}>
                    {(['none', '1h_before', '1d_before'] as const).map((opt) => {
                      const labels = { none: 'No Reminder', '1h_before': '1 Hour Before', '1d_before': '1 Day Before' };
                      const active = reminderOffset === opt;
                      return (
                        <Pressable
                          key={opt}
                          onPress={() => setReminderOffset(opt)}
                          style={[ms.reminderChip, active && ms.reminderChipActive]}
                        >
                          <Text style={[ms.reminderChipText, active && ms.reminderChipTextActive]}>{labels[opt]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Category */}
                <View style={ms.formGroup}>
                  <Text style={ms.formLabel}>CATEGORY / POST TYPE</Text>
                  <View style={ms.catRow}>
                    {catEntries.map(([key, conf]) => {
                      const active = category === key;
                      return (
                        <CategoryButton
                          key={key}
                          itemKey={key}
                          conf={conf}
                          active={active}
                          onPress={() => setCategory(key as ADHDCategory)}
                        />
                      );
                    })}
                  </View>
                </View>

              </View>

            </View>

            {/* Lightbox placed outside flow but kept in modal */}
            <Modal visible={lightbox.visible} transparent animationType="fade" onRequestClose={() => setLightbox({ visible: false, file: null })}>
              <View style={ms.lightboxOverlay}>
                <TouchableOpacity style={ms.lightboxClose} onPress={() => setLightbox({ visible: false, file: null })}>
                  <Text style={ms.lightboxCloseText}>✕</Text>
                </TouchableOpacity>
                {lightbox.file?.type === 'image' && (
                  <Image
                    source={{ uri: lightbox.file.uri }}
                    style={ms.lightboxImage}
                    resizeMode="contain"
                  />
                )}
                {lightbox.file?.type === 'video' && (
                  <View style={ms.lightboxVideo}>
                    {isScrubbing && (
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS === 'web' && videoRef.current) {
                            const vid = videoRef.current as HTMLVideoElement;
                            const canvas = document.createElement('canvas');
                            canvas.width = vid.videoWidth || 320;
                            canvas.height = vid.videoHeight || 180;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                              ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
                              setCapturedThumbnail(canvas.toDataURL('image/jpeg', 0.7));
                            }
                            const ct = (vid.currentTime || 0) * 1000;
                            setThumbnailTime(ct);
                            setVideoPosition(ct);
                          } else {
                            setThumbnailTime(videoPosition);
                          }
                          setIsScrubbing(false);
                          fireCaptureToast();
                        }}
                        style={ms.thumbBtnTopLightbox}
                        activeOpacity={0.85}
                      >
                        <Text style={ms.thumbBtnText}>📸 Capture This Scene</Text>
                      </TouchableOpacity>
                    )}
                    <NativeWebVideo
                      uri={lightbox.file.uri}
                      videoElRef={videoRef}
                      onTimeUpdate={Object.assign(
                        (posMs: number, durMs: number) => {
                          setVideoPosition(posMs);
                          if (durMs) setVideoDuration(durMs);
                        },
                        {
                          _onScrubStart: () => {
                            if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
                            setIsScrubbing(true);
                          },
                          _onScrubEnd: () => {
                            if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
                            scrubTimerRef.current = setTimeout(() => {}, 5000);
                          },
                        }
                      )}
                    />
                  </View>
                )}
                {lightbox.file?.type === 'document' && (
                  (lightbox.file.mimeType === 'application/pdf' || lightbox.file.name?.toLowerCase().endsWith('.pdf')) ? (
                    Platform.OS === 'web' ? (
                      <View style={ms.lightboxDoc}>
                        <Text style={ms.lightboxDocIcon}>📄</Text>
                        <Text style={ms.lightboxDocName}>{lightbox.file.name}</Text>
                        <Pressable
                          onPress={() => (window as any).open(lightbox.file!.uri, '_blank')}
                          style={ms.openPdfBtn}
                        >
                          <Text style={ms.openPdfBtnText}>Open PDF in new tab ↗</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={ms.lightboxWebviewWrap}>
                         <WebView source={{ uri: lightbox.file.uri }} style={{ flex: 1 }} startInLoadingState scalesPageToFit />
                      </View>
                    )
                  ) : (
                    <View style={ms.lightboxDoc}>
                      <Text style={ms.lightboxDocIcon}>📄</Text>
                      <Text style={ms.lightboxDocName}>{lightbox.file.name}</Text>
                      <Text style={ms.lightboxDocHint}>Document preview not available for this file type.</Text>
                    </View>
                  )
                )}
              </View>
            </Modal>

            {/* Footer — Schedule + Draft buttons with category-colored hover */}
            <View style={ms.footerStack}>
              <Pressable
                onPress={isValid ? handleSchedule : undefined}
                onHoverIn={() => setScheduleHovered(true)}
                onHoverOut={() => setScheduleHovered(false)}
                style={[
                  ms.scheduleBtn,
                  !isValid && ms.scheduleBtnDisabled,
                  isValid && { backgroundColor: ADHD_CATEGORIES[category].color },
                  isValid && scheduleHovered && {
                    shadowColor: ADHD_CATEGORIES[category].color,
                    shadowOpacity: 0.6,
                    shadowRadius: 20,
                    elevation: 12,
                    backgroundColor: ADHD_CATEGORIES[category].color,
                  },
                ]}
              >
                <Text style={ms.scheduleBtnText}>
                  {isValid ? (initialData ? '✏️ Update' : '✨ Schedule') : 'Schedule'}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDraft}
                onHoverIn={() => setDraftHovered(true)}
                onHoverOut={() => setDraftHovered(false)}
                style={[
                  ms.draftBtnContainer,
                  { borderColor: ADHD_CATEGORIES[category].color + '44' },
                  draftHovered && {
                    backgroundColor: ADHD_CATEGORIES[category].color + '26',
                    borderColor: ADHD_CATEGORIES[category].color + '66',
                    shadowColor: ADHD_CATEGORIES[category].color,
                    shadowOpacity: 0.35,
                    shadowRadius: 16,
                    elevation: 8,
                  },
                ]}
              >
                <Text style={[ms.draftBtnText, { color: ADHD_CATEGORIES[category].color }]}>Save Draft</Text>
              </Pressable>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>

        {/* ── Thumbnail Captured Toast — OUTSIDE sheet to avoid overflow:hidden clipping ── */}
        {thumbnailCaptured && (
          <Animated.View
            pointerEvents="none"
            style={[ms.captureToast, {
              opacity: captureToastAnim,
              transform: [{ scale: captureToastAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            }]}
          >
            <Text style={ms.captureToastText}>📸 Thumbnail Captured!</Text>
          </Animated.View>
        )}

      </View>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 24 },
  sheet: { backgroundColor: colors.bgSecondary, borderRadius: 20, maxHeight: '94%', width: '100%', maxWidth: 860, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: typography.fontSizeLg, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: typography.fontSizeXs, color: colors.textSecondary, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 16, color: colors.textSecondary, fontWeight: '700' },
  body: { paddingHorizontal: 24, paddingTop: 20 },
  
  // Grid layout styles
  desktopTwoColumn: { flexDirection: 'row', gap: 32 },
  mobileSingleColumn: { flexDirection: 'column' },
  desktopColLeft: { flex: 0.42, flexDirection: 'column', height: '100%' },
  desktopColRight: { flex: 0.58, flexDirection: 'column' },
  dateTimeRow: { flexDirection: 'row', gap: 16 },

  formGroup: { marginBottom: 18 },
  formLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 8 },

  portraitContainer: { width: '100%', aspectRatio: 9 / 16, maxHeight: 580 },

  uploadZone: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#4e4e60', borderRadius: radius.md, backgroundColor: colors.bgInput, overflow: 'hidden' },
  uploadInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  uploadIcon: { fontSize: 30, marginBottom: 8 },
  uploadTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  uploadHint: { fontSize: 11, color: colors.textTertiary, textAlign: 'center' },
  
  uploadPill: { backgroundColor: '#E0285A' + '1A', borderWidth: 1, borderColor: '#E0285A' + '66', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4 },
  uploadPillText: { fontSize: 9, fontWeight: '800', color: '#E0285A' },

  thumbBtnTop: { position: 'absolute', top: 10, left: 12, right: 12, zIndex: 20, padding: 10, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 12, borderWidth: 1, borderColor: NF_BLUE + '55', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  thumbBtnTopLightbox: { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 20, padding: 12, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 12, borderWidth: 1, borderColor: NF_BLUE + '55', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  thumbBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  uploadBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  uploadBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: NF_BLUE, borderRadius: radius.sm },
  uploadBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  
  filePreview: { borderWidth: 2, borderColor: NF_BLUE, borderRadius: radius.md, overflow: 'hidden', backgroundColor: NF_BLUE + '0A' },
  fileImage: { width: '100%', height: 180 },
  docPreview: { padding: 20, alignItems: 'center', gap: 8 },
  docIcon: { fontSize: 40 },
  docName: { fontSize: 13, color: colors.textPrimary, fontWeight: '500', textAlign: 'center' },
  fileDeleteBtn: { padding: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgInput },
  fileDeleteText: { fontSize: 12, fontWeight: '600', color: colors.error },

  textInput: { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  textArea: { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, fontWeight: '500', color: colors.textPrimary, minHeight: 110 },
  textAreaFocused: { borderColor: NF_BLUE, shadowColor: NF_BLUE_GLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3 },
  charCount: { fontSize: 10, color: colors.textTertiary, textAlign: 'right', marginTop: 4 },

  inputDisplay: { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: NF_BLUE + '55', borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13 },
  inputDisplayText: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  pickerDoneBtn: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 6, marginTop: 6 },
  pickerDoneText: { fontSize: 14, fontWeight: '700', color: NF_BLUE },

  timesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  clockCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: NF_BLUE + '22', borderWidth: 1.5, borderColor: NF_BLUE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 4,
  },
  clockFace: { fontSize: 12 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full },
  chipActive: { borderColor: NF_BLUE, backgroundColor: NF_BLUE + '18' },
  chipText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  chipTextActive: { color: NF_BLUE, fontWeight: '700' },

  uploadZoneActive: { borderColor: NF_BLUE, borderStyle: 'dashed', shadowColor: NF_BLUE_GLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 16, elevation: 10, backgroundColor: NF_BLUE + '0A' },
  uploadTypesLabel: { fontSize: 10, color: NF_BLUE, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  tapToView: { fontSize: 11, color: NF_BLUE, fontWeight: '600', marginTop: 4, textDecorationLine: 'underline' },

  uploadSuccessBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#34D399' + '22', borderWidth: 1, borderColor: '#34D399' + '55', borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, gap: 10 },
  uploadSuccessText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#34D399' },
  uploadAnotherBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#34D399' + '33', borderRadius: radius.full },
  uploadAnotherText: { fontSize: 11, fontWeight: '700', color: '#34D399' },
  openPdfBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 12, backgroundColor: NF_BLUE, borderRadius: radius.full },
  openPdfBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  lightboxOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' },
  lightboxClose: { position: 'absolute', top: 52, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  lightboxCloseText: { fontSize: 20, color: '#fff', fontWeight: '700' },
  lightboxImage: { width: '100%', height: '80%' },
  lightboxVideo: { width: '100%', height: '70%' },
  lightboxWebviewWrap: { width: '100%', height: '85%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  lightboxDoc: { alignItems: 'center', gap: 16, padding: 40 },
  lightboxDocIcon: { fontSize: 64 },
  lightboxDocName: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center' },
  lightboxDocHint: { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },

  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full },
  reminderChipActive: { borderColor: '#F59E0B', backgroundColor: '#F59E0B18' },
  reminderChipText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  reminderChipTextActive: { color: '#F59E0B', fontWeight: '700' },

  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  catEmoji: { fontSize: 14 },
  catLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },

  footerStack: { gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  scheduleBtn: { width: '100%', paddingVertical: 14, paddingHorizontal: 24, backgroundColor: NF_BLUE, borderRadius: radius.full, alignItems: 'center', shadowColor: NF_BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  scheduleBtnDisabled: { backgroundColor: colors.bgElevated, shadowOpacity: 0 },
  scheduleBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  draftBtnContainer: { width: '100%', paddingVertical: 14, paddingHorizontal: 24, backgroundColor: 'transparent', borderRadius: radius.full, alignItems: 'center', borderWidth: 1.5 },
  draftBtnText: { fontSize: 14, fontWeight: '700' },

  captureToast: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.88)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: NF_BLUE + '66',
    shadowColor: NF_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 999,
  },
  captureToastText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
