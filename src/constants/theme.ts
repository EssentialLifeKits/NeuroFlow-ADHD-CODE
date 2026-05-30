/**
 * NeuroFlow — Design System Tokens
 * Brand: NeuroFlow Pro by Essential Life Kits
 * Primary blue: #4A90E2 · Dark mode throughout
 */
export const colors = {
  // Backgrounds
  bgBase: '#0a0a0f',
  bgSecondary: '#12121a',
  bgCard: '#16161f',
  bgCardHover: '#1c1c28',
  bgElevated: '#1e1e2a',
  bgInput: '#1a1a26',

  // Text
  textPrimary: '#f0f0f5',
  textSecondary: '#8b8b9e',
  textTertiary: '#5c5c72',
  textInverse: '#0a0a0f',

  // Borders
  border: 'rgba(255, 255, 255, 0.06)',
  borderHover: 'rgba(255, 255, 255, 0.12)',

  // NeuroFlow brand accents
  accentBlue: '#4A90E2',    // primary NeuroFlow blue
  accentCyan: '#00C6FF',    // secondary cyan
  accentPurple: '#7B5EA7',  // purple (Focus long-break sessions)
  accentGreen: '#34D399',   // success / active
  accentAmber: '#FBBF24',   // warning / deadline
  accentRed: '#F87171',     // error / self-care

  // Semantic
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',

  // ADHD task category colors (calendar color bars)
  colorTask:        '#4A90E2',  // blue  — Task
  colorAppointment: '#34D399',  // green — Appointment
  colorSelfCare:    '#F87171',  // red   — Self-Care
  colorRoutine:     '#FBBF24',  // amber — Routine
  colorDeadline:    '#FB923C',  // orange — Deadline

  // Primary alias — NeuroFlow blue
  primary: '#4A90E2',
  primaryLight: '#7B5EA7',
  primaryMuted: 'rgba(74, 144, 226, 0.08)',
  accent: '#4A90E2',
  textMuted: '#5c5c72',
  bgSubtle: '#1e1e2a',

  // Google brand
  google: '#4285F4',
  googleDark: '#3367D6',

  white: '#FFFFFF',
  black: '#000000',

  // Calendar view accent backgrounds (NeuroFlow blue family)
  dailyBg:   'rgba(74, 144, 226, 0.06)',
  weeklyBg:  'rgba(123, 94, 167, 0.06)',
  monthlyBg: 'rgba(0, 198, 255, 0.06)',

  // Neon palette (task-card accents)
  neonBlue: '#00D4FF',
  neonGreen: '#39FF14',
  neonPink: '#FF2D55',
  neonPurple: '#CF6CF7',
  neonOrange: '#FF9F0A',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const typography = {
  fontSizeXs: 11,
  fontSizeSm: 13,
  fontSizeMd: 15,
  fontSizeLg: 18,
  fontSizeXl: 22,
  fontSizeXxl: 28,
  fontSizeDisplay: 36,

  lineHeightTight: 1.2,
  lineHeightNormal: 1.5,
  lineHeightRelaxed: 1.75,
} as const;

/** ADHD task category configuration — used by calendar + modal */
export const TASK_CATEGORIES = {
  task:        { label: 'Task',        color: colors.colorTask,        emoji: '📋' },
  appointment: { label: 'Appointment', color: colors.colorAppointment, emoji: '📅' },
  selfcare:    { label: 'Self-Care',   color: colors.colorSelfCare,    emoji: '💆' },
  routine:     { label: 'Routine',     color: colors.colorRoutine,     emoji: '🔄' },
  deadline:    { label: 'Deadline',    color: colors.colorDeadline,    emoji: '⏰' },
} as const;

export type TaskCategory = keyof typeof TASK_CATEGORIES;

export const NEON_PALETTE = [
  colors.neonBlue,
  colors.neonGreen,
  colors.neonPink,
  colors.neonPurple,
  colors.neonOrange,
] as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
