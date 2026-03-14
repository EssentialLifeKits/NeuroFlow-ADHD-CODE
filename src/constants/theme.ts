/**
 * NeuroFlow — Design System (GramLogic Dark Mode Tokens)
 * Exact hex values from the GramLogic CSS :root blueprint.
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

  // Instagram / Brand accent
  accentInstagram: '#DD2A7B',
  accentPurple: '#8134AF',
  accentOrange: '#F58529',
  accentBlue: '#515BD4',
  accentYellow: '#FEDA75',

  // Semantic
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',

  // Post type colors (calendar color bars)
  colorPost: '#FEDA75',
  colorStory: '#34D399',
  colorReel: '#F87171',
  colorCarousel: '#60A5FA',
  colorLive: '#FB923C',

  // Legacy aliases (for existing screens that use old names)
  primary: '#DD2A7B',
  primaryLight: '#8134AF',
  primaryMuted: 'rgba(221, 42, 123, 0.08)',
  accent: '#8134AF',
  textMuted: '#5c5c72',
  bgSubtle: '#1e1e2a',

  // Google brand
  google: '#4285F4',
  googleDark: '#3367D6',

  white: '#FFFFFF',
  black: '#000000',

  // Calendar view accent backgrounds
  dailyBg: 'rgba(221, 42, 123, 0.06)',
  weeklyBg: 'rgba(129, 52, 175, 0.06)',
  monthlyBg: 'rgba(245, 133, 41, 0.06)',

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

/** Post type configuration — used by calendar + modal */
export const POST_TYPES = {
  post: { label: 'Post', color: colors.colorPost, emoji: '📸' },
  story: { label: 'Story', color: colors.colorStory, emoji: '⭕' },
  reel: { label: 'Reel', color: colors.colorReel, emoji: '🎬' },
  carousel: { label: 'Carousel', color: colors.colorCarousel, emoji: '📑' },
  live: { label: 'Live', color: colors.colorLive, emoji: '🔴' },
} as const;

export type PostType = keyof typeof POST_TYPES;

export const NEON_PALETTE = [
  colors.neonBlue,
  colors.neonGreen,
  colors.neonPink,
  colors.neonPurple,
  colors.neonOrange,
] as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
