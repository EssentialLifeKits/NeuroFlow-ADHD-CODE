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

function normalizeReminderOffset(rule?: string | null, savedAlertOffset?: unknown): string {
  if (rule && rule !== 'none' && rule !== 'sent') {
    const minuteMatch = rule.match(/^(\d+)min_before$/);
    if (minuteMatch) return minuteMatch[1];
    if (rule === '1h_before') return '60';
    if (rule === '1d_before') return '1440';
  }

  if (savedAlertOffset && savedAlertOffset !== 'none') return String(savedAlertOffset);
  return 'none';
}

async function captureCurrentVideoFrame(videoElRef: React.RefObject<any>): Promise<string | null> {
  if (Platform.OS !== 'web' || !videoElRef.current) return null;
  const vid = videoElRef.current as HTMLVideoElement;

  if (vid.readyState < 2 || !vid.videoWidth || !vid.videoHeight) {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        vid.removeEventListener('loadeddata', finish);
        vid.removeEventListener('seeked', finish);
        resolve();
      };
      vid.addEventListener('loadeddata', finish, { once: true });
      vid.addEventListener('seeked', finish, { once: true });
      window.setTimeout(finish, 900);
    });
  }

  if (!vid.videoWidth || !vid.videoHeight) return null;

  const canvas = document.createElement('canvas');
  canvas.width = vid.videoWidth;
  canvas.height = vid.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function isPdfDocument(file?: Pick<AttachedFile, 'mimeType' | 'name'> | null): boolean {
  if (!file) return false;
  return file.mimeType === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf') === true;
}

function loadPDFJS(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      reject(new Error('PDF thumbnails are only available on web'));
      return;
    }
    if ((window as any).__nfPdfjsLib) {
      resolve((window as any).__nfPdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (!lib) {
        reject(new Error('PDF.js did not load'));
        return;
      }
      lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      (window as any).__nfPdfjsLib = lib;
      resolve(lib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });
}

async function renderPdfThumbnail(uri: string): Promise<string | null> {
  if (Platform.OS !== 'web' || !uri) return null;
  try {
    const pdfjs = await loadPDFJS();
    const pdfDoc = await pdfjs.getDocument(uri).promise;
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 0.38 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.68);
  } catch (error) {
    console.warn('[ScheduleModal] PDF thumbnail render failed:', error);
    return null;
  }
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

  const { addTask, editTask, refreshTasks } = useTasks();
  const { user } = useAuth();

  const [taskDetails, setTaskDetails] = useState('');
  const [tags, setTags] = useState('');
  // reminderOffset stored as minutes string e.g. "30" = 30 min before, "0" = at time, "none" = no reminder
  const [reminderOffset, setReminderOffset] = useState<string>('none');
  const [customMinutes, setCustomMinutes] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
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

  // Default time = 1 hour from now, rounded up to the next 15-minute mark.
  // This ensures new tasks are always in the future so the email is scheduled,
  // not fired immediately (which happens when the due time is within 5 min of save time).
  const initTime = () => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0); // +1 hour, reset minutes/seconds
    const mins = d.getMinutes(); // always 0 after setHours above, but kept for clarity
    const rounded = Math.ceil(mins / 15) * 15;
    if (rounded >= 60) { d.setHours(d.getHours() + 1, 0, 0, 0); }
    else { d.setMinutes(rounded, 0, 0); }
    return d;
  };

  const [pickedDate, setPickedDate] = useState<Date>(initDate);
  const [pickedTime, setPickedTime] = useState<Date>(initTime);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      if (initialData) {
        setTaskDetails(initialData.title ?? '');
        setTags(initialData.description ?? '');
        const cat = (initialData.chore_category?.toLowerCase() ?? 'task') as ADHDCategory;
        setCategory(ADHD_CATEGORIES[cat] ? cat : 'task');
        let parsedSticker: any = null;
        if (initialData.sticker_id && initialData.sticker_id.startsWith('{')) {
          try {
            parsedSticker = JSON.parse(initialData.sticker_id);
          } catch {}
        }
        setReminderOffset(normalizeReminderOffset(initialData.recurrence_rule, parsedSticker?.alertOffset));
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
        } else setPickedTime(initTime());

        if (parsedSticker && ['image', 'video', 'document'].includes(parsedSticker.type)) {
          setAttachedFile({ uri: parsedSticker.uri || parsedSticker.thumbnail || '', type: parsedSticker.type, name: parsedSticker.name || 'media', width: parsedSticker.width, height: parsedSticker.height });
          setThumbnailTime(parsedSticker.thumbTime ?? null);
          setCapturedThumbnail(parsedSticker.thumbnail ?? (parsedSticker.type === 'document' ? parsedSticker.uri ?? 'document' : null));
        }
      } else {
        setTaskDetails(''); setTags(''); setCategory('task'); setReminderOffset('none'); setCustomMinutes(''); setShowCustomInput(false);
        setDetailsFocused(false); setSelectedChipTime(null); setAttachedFile(null); setUploadSuccess(false);
        setThumbnailTime(null); setCapturedThumbnail(null);
        setPickedDate(initDate()); setPickedTime(initTime());
      }
    }
  }, [visible, selectedDate, initialData]);

  const handleClose = () => { onClose(); };

  const selectedEmailThumbnail = () => {
    if (!attachedFile) return null;
    if (capturedThumbnail) return capturedThumbnail;
    if (attachedFile.type === 'image' && attachedFile.uri?.startsWith('data:image/')) return attachedFile.uri;
    return null;
  };

  const selectedAttachmentType = () => attachedFile?.type ?? null;
  const selectedAttachmentName = () => attachedFile?.name ?? null;
  const selectedAlertOffset = () => {
    if (reminderOffset === 'none' || reminderOffset === '0') return null;
    const minutes = parseInt(reminderOffset, 10);
    return Number.isFinite(minutes) && minutes > 0 ? String(minutes) : null;
  };

  const captureDocumentThumbnail = async () => {
    if (!attachedFile || attachedFile.type !== 'document') return;
    setThumbnailTime(0);
    if (isPdfDocument(attachedFile) && attachedFile.uri) {
      const rendered = await renderPdfThumbnail(attachedFile.uri);
      setCapturedThumbnail(rendered ?? 'document');
    } else {
      setCapturedThumbnail('document');
    }
    fireCaptureToast();
  };

  useEffect(() => {
    let cancelled = false;
    if (attachedFile?.type === 'document' && isPdfDocument(attachedFile) && attachedFile.uri && (!capturedThumbnail || capturedThumbnail === 'document' || capturedThumbnail.startsWith('data:application/pdf'))) {
      renderPdfThumbnail(attachedFile.uri).then((rendered) => {
        if (!cancelled && rendered) setCapturedThumbnail(rendered);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [attachedFile, capturedThumbnail]);

  const buildStickerId = () => {
    if (!attachedFile) {
      const alertOffset = selectedAlertOffset();
      return alertOffset ? JSON.stringify({ type: 'alert-meta', alertOffset }) : null;
    }
    const base = {
      type: attachedFile.type,
      name: attachedFile.name,
      alertOffset: selectedAlertOffset(),
      thumbTime: thumbnailTime,
    };

    if (attachedFile.type === 'video') {
      return JSON.stringify({
        ...base,
        thumbnail: capturedThumbnail,
      });
    }

    if (attachedFile.type === 'document') {
      const MAX_DOC_CHARS = 400 * 1024; // ~300 KB base64 -> safe for DB
      const canPersistDocument = attachedFile.uri && attachedFile.uri.length <= MAX_DOC_CHARS;
      return JSON.stringify({
        ...base,
        thumbnail: capturedThumbnail || (canPersistDocument ? attachedFile.uri : 'document'),
        ...(canPersistDocument ? { uri: attachedFile.uri } : {}),
      });
    }

    return JSON.stringify({
      ...base,
      uri: attachedFile.uri,
      width: attachedFile.width,
      height: attachedFile.height,
    });
  };

  const handleSchedule = async () => {
    if (!taskDetails.trim()) return;
    const dateStr = [
      pickedDate.getFullYear(),
      String(pickedDate.getMonth() + 1).padStart(2, '0'),
      String(pickedDate.getDate()).padStart(2, '0'),
    ].join('-');
    const timeStr = `${String(pickedTime.getHours()).padStart(2, '0')}:${String(pickedTime.getMinutes()).padStart(2, '0')}`;
    
    const sticker_id = buildStickerId();

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
      recurrence_rule: reminderOffset === 'none' ? 'none' : `${reminderOffset}min_before`, // minutes-based format
    };

    let savedTaskId: string | null = null;
    if (initialData?.id) { await editTask(initialData.id, taskInput); savedTaskId = initialData.id; }
    else { savedTaskId = await addTask(taskInput); }

    // Schedule email reminder via Resend — always fires for every task with an email
    if (user?.email) {
      const apiOffset = selectedAlertOffset() ? `${selectedAlertOffset()}min_before` : 'at_time';
      console.log('[ScheduleModal] Scheduling email reminder:', { email: user.email, dueDate: dateStr, dueTime: timeStr, apiOffset, taskId: savedTaskId });
      try {
        const resp = await fetch('/api/schedule-reminder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: taskDetails.trim(),
            dueDate: dateStr,
            dueTime: timeStr,
            category,
            userName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email,
            email: user.email,
            reminderOffset: apiOffset,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            taskId: savedTaskId,
            thumbnail: selectedEmailThumbnail(),
            attachmentType: selectedAttachmentType(),
            attachmentName: selectedAttachmentName(),
          }),
        });
        const result = await resp.json();
        if (!resp.ok || result.scheduled?.every((r: any) => r.error)) {
          const detail = result.scheduled?.find((r: any) => r.error)?.error ?? result.error ?? 'Unknown error';
          console.error('[ScheduleModal] Email scheduling failed:', resp.status, result);
          Alert.alert('⚠️ Email Reminder Failed', `Your entry was saved but the email reminder could not be scheduled.\n\n${detail}`);
        } else {
          console.log('[ScheduleModal] Email scheduled successfully:', result);
          await refreshTasks();
        }
      } catch (e) {
        console.warn('[ScheduleModal] schedule-reminder fetch failed:', e);
        Alert.alert('⚠️ Email Reminder Failed', 'Your entry was saved but the email reminder could not be reached. Check your connection.');
      }
    } else {
      console.warn('[ScheduleModal] No user email found, skipping email reminder');
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
    
    const sticker_id = buildStickerId();

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
      recurrence_rule: reminderOffset === 'none' ? 'none' : `${reminderOffset}min_before`,
    };

    if (initialData?.id) { await editTask(initialData.id, taskInput); }
    else { await addTask(taskInput); }

    handleClose();
    Alert.alert(
      '📝 Draft Saved!',
      'Your draft is saved! Find it in the Drafts section on your Dashboard to continue editing anytime.',
    );
  };

  const pickImage = async (mediaKind: 'all' | 'image' | 'video' = 'all') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access in Settings.'); return; }
    const mediaTypes = mediaKind === 'image' ? ['images'] : mediaKind === 'video' ? ['videos'] : ['images', 'videos'];
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video' || (asset.fileName ?? '').match(/\.(mp4|mov|avi|mkv)$/i);
      if (!isVideo && Platform.OS === 'web') {
        // Convert to base64 so thumbnail persists after re-login
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onload = (ev: any) => {
          const uri = ev.target.result as string;
          setAttachedFile({
            uri,
            name: cleanFileName(asset.fileName ?? 'image'),
            mimeType: asset.mimeType,
            type: 'image',
            width: asset.width,
            height: asset.height,
          });
          setCapturedThumbnail(uri);
          setThumbnailTime(0);
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
            const uri = ev.target.result as string;
            setAttachedFile({
              uri,
              name: cleanFileName(nm),
              mimeType: mime,
              type: 'image',
            });
            setCapturedThumbnail(uri);
            setThumbnailTime(0);
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
          reader.onload = async (ev: any) => {
            const uri = ev.target.result as string;
            setAttachedFile({
              uri,
              name: cleanFileName(nm),
              mimeType: mime,
              type: 'document',
            });
            setCapturedThumbnail('document');
            setThumbnailTime(0);
            setUploadSuccess(true);
            if (mime === 'application/pdf' || nm.toLowerCase().endsWith('.pdf')) {
              const rendered = await renderPdfThumbnail(uri);
              if (rendered) setCapturedThumbnail(rendered);
            }
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
                          <TouchableOpacity onPress={() => { setThumbnailTime(0); setCapturedThumbnail(attachedFile.uri); fireCaptureToast(); }} style={ms.thumbBtnTop} activeOpacity={0.85}>
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
                                  onPress={async () => {
                                    if (Platform.OS === 'web' && videoRef.current) {
                                      const vid = videoRef.current as HTMLVideoElement;
                                      const frame = await captureCurrentVideoFrame(videoRef);
                                      if (frame) setCapturedThumbnail(frame);
                                      else Alert.alert('Thumbnail not ready', 'Play or scrub the video for a moment, then capture again.');
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
                                  onPress={captureDocumentThumbnail}
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
                                  onPress={captureDocumentThumbnail}
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

                      {capturedThumbnail ? (
                        <View pointerEvents="none" style={ms.capturedThumbPreview}>
                          {attachedFile.type === 'document' ? (
                            <View style={ms.capturedDocThumb}>
                              {capturedThumbnail.startsWith('data:image/') ? (
                                <Image source={{ uri: capturedThumbnail }} style={ms.capturedThumbImage} resizeMode="cover" />
                              ) : (
                                <Text style={ms.capturedDocIcon}>📄</Text>
                              )}
                            </View>
                          ) : (
                            <Image source={{ uri: capturedThumbnail }} style={ms.capturedThumbImage} resizeMode="cover" />
                          )}
                          <View style={ms.capturedThumbCheck}>
                            <Text style={ms.capturedThumbCheckText}>✓</Text>
                          </View>
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
                        <Text style={ms.uploadHint}>Supports images, videos, and PDF/documents</Text>
                        <View style={ms.uploadPill}>
                          <Text style={ms.uploadPillText}>9:16 Portrait (1080x1920)</Text>
                        </View>
                        <View style={ms.uploadBtnRow}>
                          <TouchableOpacity onPress={() => pickImage('image')} style={ms.uploadBtn} activeOpacity={0.85}>
                            <Text style={ms.uploadBtnText}>📷 Image</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => pickImage('video')} style={ms.uploadBtn} activeOpacity={0.85}>
                            <Text style={ms.uploadBtnText}>🎬 Video</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={pickDocument} style={ms.uploadBtn} activeOpacity={0.85}>
                            <Text style={ms.uploadBtnText}>📄 Document / PDF</Text>
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
                    {([
                      { value: 'none',  label: 'None' },
                      { value: '5',     label: '5 min' },
                      { value: '15',    label: '15 min' },
                      { value: '30',    label: '30 min' },
                      { value: '60',    label: '1 hour' },
                      { value: '120',   label: '2 hours' },
                      { value: '1440',  label: '1 day' },
                      { value: 'custom', label: 'Custom' },
                    ]).map(({ value, label }) => {
                      const active = value === 'custom'
                        ? showCustomInput
                        : reminderOffset === value && !showCustomInput;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => {
                            if (value === 'custom') {
                              setShowCustomInput(true);
                              setReminderOffset('none');
                            } else {
                              setShowCustomInput(false);
                              setCustomMinutes('');
                              setReminderOffset(value);
                            }
                          }}
                          style={[ms.reminderChip, active && ms.reminderChipActive]}
                        >
                          <Text style={[ms.reminderChipText, active && ms.reminderChipTextActive]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {showCustomInput && (
                    <View style={ms.customReminderRow}>
                      <TextInput
                        style={ms.customReminderInput}
                        placeholder="Enter minutes (e.g. 45)"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="numeric"
                        value={customMinutes}
                        onChangeText={(v) => {
                          setCustomMinutes(v);
                          const mins = parseInt(v, 10);
                          if (!isNaN(mins) && mins > 0) setReminderOffset(String(mins));
                        }}
                      />
                      <Text style={ms.customReminderLabel}>minutes before</Text>
                    </View>
                  )}
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
                    {(
                      <TouchableOpacity
                        onPress={async () => {
                          if (Platform.OS === 'web' && videoRef.current) {
                            const vid = videoRef.current as HTMLVideoElement;
                            const frame = await captureCurrentVideoFrame(videoRef);
                            if (frame) setCapturedThumbnail(frame);
                            else Alert.alert('Thumbnail not ready', 'Play or scrub the video for a moment, then capture again.');
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
                        <Text style={ms.thumbBtnText}>📸 Capture Thumbnail</Text>
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
                {capturedThumbnail && lightbox.file ? (
                  <View
                    pointerEvents="none"
                    style={[
                      ms.capturedThumbPreviewLightbox,
                      Platform.OS === 'web' && ms.capturedThumbPreviewLightboxWeb,
                    ]}
                  >
                    {lightbox.file.type === 'document' ? (
                      <View style={ms.capturedDocThumb}>
                        {capturedThumbnail.startsWith('data:image/') ? (
                          <Image source={{ uri: capturedThumbnail }} style={ms.capturedThumbImage} resizeMode="cover" />
                        ) : (
                          <Text style={ms.capturedDocIcon}>📄</Text>
                        )}
                      </View>
                    ) : (
                      <Image source={{ uri: capturedThumbnail }} style={ms.capturedThumbImage} resizeMode="cover" />
                    )}
                    <View style={ms.capturedThumbCheck}>
                      <Text style={ms.capturedThumbCheckText}>✓</Text>
                    </View>
                  </View>
                ) : null}
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
  
  filePreview: { position: 'relative', borderWidth: 2, borderColor: NF_BLUE, borderRadius: radius.md, overflow: 'hidden', backgroundColor: NF_BLUE + '0A' },
  fileImage: { width: '100%', height: 180 },
  capturedThumbPreview: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 58,
    height: 74,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#E02872',
    backgroundColor: '#0e0e1a',
    overflow: 'hidden',
    zIndex: 30,
    shadowColor: '#E02872',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 8,
  },
  capturedThumbPreviewLightbox: {
    position: 'absolute',
    top: 32,
    right: 24,
    width: 78,
    height: 98,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#E02872',
    backgroundColor: '#0e0e1a',
    overflow: 'hidden',
    zIndex: 180,
    shadowColor: '#E02872',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  capturedThumbPreviewLightboxWeb: {
    position: 'fixed' as any,
    top: 52,
    right: 32,
    zIndex: 9999,
  },
  capturedThumbImage: { width: '100%', height: '100%' },
  capturedDocThumb: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e1e35' },
  capturedDocIcon: { fontSize: 28 },
  capturedThumbCheck: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  capturedThumbCheckText: { color: '#07111f', fontSize: 12, fontWeight: '900' },
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
  lightboxVideo: { position: 'relative', width: '100%', height: '70%' },
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
  customReminderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  customReminderInput: { flex: 1, height: 40, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: '#F59E0B55', borderRadius: radius.sm, paddingHorizontal: 12, color: colors.textPrimary, fontSize: 14 },
  customReminderLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },

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
