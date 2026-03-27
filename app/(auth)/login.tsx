/**
 * NeuroFlow — Hero Login Screen
 * ─────────────────────────────────────────────────────────────────────────────
 * ✅ G-Logic-style hero layout: full-page dark bg, glowing orb, feature pills
 * ✅ NeuroFlow brand colors: #4A90E2 → #00C6FF gradient + deep #0a0a0f bg
 * ✅ All auth logic preserved: email/password, Google OAuth, reset, signup
 * ✅ Dev Bypass preserved
 * ✅ Responsive: max 440px card centered on desktop, full-width on mobile
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, spacing, typography } from '../../src/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Path } from 'react-native-svg';
import { Pressable } from 'react-native';

// ─── Brand colours ────────────────────────────────────────────────────────────
const NF_BLUE  = '#4A90E2';
const NF_CYAN  = '#00C6FF';
const NF_DARK  = '#0a0a0f';
const NF_CARD  = '#12121a';
const NF_CARD2 = '#16161f';

// ─── Google SVG icon ─────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"/>
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </Svg>
);

// ─── Gradient text (web + native) ─────────────────────────────────────────────
type Mode = 'signin' | 'signup' | 'reset';

const GradientText = (props: any) => {
  if (Platform.OS === 'web') {
    return (
      <Text
        {...props}
        style={[
          props.style,
          {
            backgroundImage: `linear-gradient(to right, ${NF_BLUE}, ${NF_CYAN})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          } as any,
        ]}
      />
    );
  }
  return (
    <MaskedView maskElement={<Text {...props} />}>
      <LinearGradient
        colors={[NF_BLUE, NF_CYAN]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text {...props} style={[props.style, { opacity: 0 }]} />
      </LinearGradient>
    </MaskedView>
  );
};

// ─── Feature pill ─────────────────────────────────────────────────────────────
const FeaturePill = ({ emoji, label }: { emoji: string; label: string }) => (
  <View style={pillStyles.pill}>
    <View style={pillStyles.dot} />
    <Text style={pillStyles.text}>{emoji}  {label}</Text>
  </View>
);

const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74,144,226,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(74,144,226,0.25)',
    borderRadius: 99,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    backgroundColor: NF_BLUE,
  },
  text: {
    fontSize: 13,
    color: '#c4c4d4',
    fontWeight: '500',
  },
});

// ─── Main component ───────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { signInWithEmail, signUp, resetPassword, signInWithGoogle, devBypass } = useAuth();
  const { width } = useWindowDimensions();

  const [mode, setMode]               = useState<Mode>('signin');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [message, setMessage]         = useState<string | null>(null);
  const [isGoogleHovered, setIsGoogleHovered] = useState(false);

  // Animated refs
  const heroOpacity    = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(-20)).current;
  const orbScale       = useRef(new Animated.Value(0.88)).current;
  const orbOpacity     = useRef(new Animated.Value(0.5)).current;
  const formOpacity    = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(20)).current;
  const orbLoop        = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Hero fade-in
    Animated.parallel([
      Animated.timing(heroOpacity,    { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(heroTranslateY, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();

    // Orb pulsing loop
    orbLoop.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orbScale,   { toValue: 1.10, duration: 2400, useNativeDriver: true }),
          Animated.timing(orbOpacity, { toValue: 1.0,  duration: 2400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(orbScale,   { toValue: 0.88, duration: 2400, useNativeDriver: true }),
          Animated.timing(orbOpacity, { toValue: 0.5,  duration: 2400, useNativeDriver: true }),
        ]),
      ]),
    );
    orbLoop.current.start();

    // Form slide-up
    Animated.parallel([
      Animated.timing(formOpacity,    { toValue: 1, duration: 550, delay: 450, useNativeDriver: true }),
      Animated.timing(formTranslateY, { toValue: 0, duration: 550, delay: 450, useNativeDriver: true }),
    ]).start();

    return () => { orbLoop.current?.stop(); };
  }, []);

  const switchMode = (next: Mode) => { setMode(next); setError(null); setMessage(null); };

  const handleSubmit = async () => {
    setError(null); setMessage(null);
    if (!email.trim()) { setError('Please enter your email.'); return; }
    if (mode !== 'reset' && !password) { setError('Please enter your password.'); return; }
    setLoading(true);
    try {
      if (mode === 'reset') {
        const err = await resetPassword(email.trim());
        if (err) setError(err); else setMessage('✅ Check your email for a reset link.');
      } else if (mode === 'signup') {
        const err = await signUp(email.trim(), password);
        if (err) setError(err);
      } else {
        const err = await signInWithEmail(email.trim(), password);
        if (err) setError(err);
      }
    } finally { setLoading(false); }
  };

  const handleGoogleSignIn = async () => {
    setError(null); setMessage(null);
    setLoading(true);
    try {
      const err = await signInWithGoogle();
      if (err) setError(err);
    } finally { setLoading(false); }
  };

  const buttonLabel =
    mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link';

  const cardWidth = Math.min(width - 32, 440);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Hero Section (above card) ── */}
          <Animated.View style={[
            styles.heroSection,
            { opacity: heroOpacity, transform: [{ translateY: heroTranslateY }] }
          ]}>
            {/* Nav bar brand */}
            <View style={styles.navBar}>
              <View style={styles.navBrand}>
                <Image
                  source={require('../../assets/elk-logo.jpg')}
                  style={styles.navLogo}
                />
                <GradientText style={styles.navBrandName}>NeuroFlow</GradientText>
              </View>
              <View style={styles.navBadge}>
                <Text style={styles.navBadgeText}>ADHD COMPANION</Text>
              </View>
            </View>

            {/* Glowing orb */}
            <Animated.View style={[
              styles.orbWrapper,
              { opacity: orbOpacity, transform: [{ scale: orbScale }] }
            ]}>
              <LinearGradient
                colors={[NF_BLUE, NF_CYAN, '#9b59b6']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.orb}
              />
            </Animated.View>

            {/* Headline */}
            <Text style={styles.headline}>Welcome to</Text>
            <GradientText style={styles.headlineBrand}>NeuroFlow ADHD</GradientText>
            <Text style={styles.tagline}>
              Your calm focus companion — tasks, reminders, and routines built for the ADHD brain.
            </Text>

            {/* Feature pills */}
            <View style={styles.pillsRow}>
              <FeaturePill emoji="🧠" label="Focus Mode" />
              <FeaturePill emoji="✅" label="Task Engine" />
              <FeaturePill emoji="⚡" label="AI-Powered" />
            </View>
            <View style={[styles.pillsRow, { marginTop: 8 }]}>
              <FeaturePill emoji="🔔" label="Smart Reminders" />
              <FeaturePill emoji="📅" label="Routine Builder" />
            </View>
          </Animated.View>

          {/* ── Auth Card ── */}
          <Animated.View style={[
            styles.card,
            { width: cardWidth, opacity: formOpacity, transform: [{ translateY: formTranslateY }] }
          ]}>
            {/* Card header */}
            <View style={styles.cardBrand}>
              <Image
                source={require('../../assets/elk-logo.jpg')}
                style={styles.cardLogo}
              />
              <GradientText style={styles.cardBrandName}>NeuroFlow</GradientText>
            </View>

            {/* Form inputs */}
            <View style={styles.formArea}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType={mode === 'reset' ? 'done' : 'next'}
                  onSubmitEditing={mode === 'reset' ? handleSubmit : undefined}
                />
              </View>

              {mode !== 'reset' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                </View>
              )}

              {error   ? <Text style={styles.errorText}>{error}</Text>   : null}
              {message ? <Text style={styles.messageText}>{message}</Text> : null}

              {/* Primary CTA */}
              <LinearGradient
                colors={[NF_BLUE, NF_CYAN]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.submitGradient, loading && styles.submitBtnDisabled]}
              >
                <TouchableOpacity
                  style={styles.submitInner}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.submitBtnText}>{buttonLabel}</Text>
                  }
                </TouchableOpacity>
              </LinearGradient>

              {/* OR separator */}
              {mode !== 'reset' && (
                <View style={styles.separatorContainer}>
                  <View style={styles.separatorLine} />
                  <Text style={styles.separatorText}>OR</Text>
                  <View style={styles.separatorLine} />
                </View>
              )}

              {/* Google OAuth */}
              {mode !== 'reset' && (
                <Pressable
                  onPress={handleGoogleSignIn}
                  onHoverIn={() => setIsGoogleHovered(true)}
                  onHoverOut={() => setIsGoogleHovered(false)}
                  style={({ pressed }: any) => [
                    styles.googleBtn,
                    pressed && styles.googleBtnPressed,
                    isGoogleHovered && styles.googleBtnHovered,
                  ]}
                >
                  <View style={styles.googleBtnContent}>
                    <GoogleIcon />
                    <Text style={styles.googleBtnText}>Sign in with Google</Text>
                  </View>
                </Pressable>
              )}

              {/* Bottom nav links */}
              {mode !== 'reset' ? (
                <View style={styles.bottomLinksContainer}>
                  <TouchableOpacity onPress={() => switchMode('reset')}>
                    <Text style={styles.bottomLinkText}>Lost Password?</Text>
                  </TouchableOpacity>
                  <Text style={styles.bottomLinkSeparator}>·</Text>
                  <TouchableOpacity onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
                    <Text style={styles.bottomLinkText}>{mode === 'signin' ? 'Create Account' : 'Sign In'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.bottomLinksContainer}>
                  <TouchableOpacity onPress={() => switchMode('signin')}>
                    <Text style={styles.bottomLinkText}>Back to Sign In</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Dev Bypass */}
              {__DEV__ && (
                <TouchableOpacity onPress={devBypass} style={styles.devBtn} activeOpacity={0.8}>
                  <Text style={styles.devBtnText}>⚡ Dev Bypass</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          {/* ── Footer ── */}
          <Text style={styles.footer}>
            Trusted by focused minds everywhere  ✦  Privacy  ·  Terms
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: NF_DARK },
  kav:  { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },

  // ── Hero ──
  heroSection: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 500,
    marginBottom: spacing.xl,
  },

  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.xl,
  },
  navBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navLogo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    overflow: 'hidden',
  },
  navBrandName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  navBadge: {
    backgroundColor: 'rgba(74,144,226,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74,144,226,0.3)',
    borderRadius: 99,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  navBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: NF_BLUE,
    letterSpacing: 1,
  },

  orbWrapper: {
    marginBottom: spacing.lg,
    shadowColor: NF_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 50,
    elevation: 20,
  },
  orb: {
    width: 110,
    height: 110,
    borderRadius: 999,
  },

  headline: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
  },
  headlineBrand: {
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.md,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
    marginBottom: spacing.lg,
  },

  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },

  // ── Card ──
  card: {
    backgroundColor: NF_CARD,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(74,144,226,0.15)',
    shadowColor: NF_BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 12,
    marginBottom: spacing.lg,
  },

  cardBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  cardLogo: {
    width: 26,
    height: 26,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardBrandName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // ── Form ──
  formArea: { gap: 10 },

  inputGroup: { gap: 6, marginBottom: 4 },

  inputLabel: {
    fontSize: typography.fontSizeSm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 2,
  },

  input: {
    backgroundColor: NF_CARD2,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.fontSizeMd,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },

  errorText:   { fontSize: typography.fontSizeXs, color: colors.error,   textAlign: 'center' },
  messageText: { fontSize: typography.fontSizeXs, color: colors.success, textAlign: 'center' },

  submitGradient: {
    borderRadius: radius.md,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitInner: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { fontSize: typography.fontSizeMd, fontWeight: '700', color: '#fff' },

  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  separatorLine: { flex: 1, height: 1, backgroundColor: colors.border },
  separatorText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
  },

  googleBtn: {
    backgroundColor: '#1a1a26',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  googleBtnHovered: {
    borderColor: 'rgba(74,144,226,0.4)',
    backgroundColor: 'rgba(74,144,226,0.06)',
  },
  googleBtnPressed: { opacity: 0.8 },
  googleBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  googleBtnText: { fontSize: typography.fontSizeMd, fontWeight: '600', color: '#fff' },

  bottomLinksContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: 8,
  },
  bottomLinkText:      { fontSize: typography.fontSizeSm, color: colors.textSecondary, fontWeight: '500' },
  bottomLinkSeparator: { fontSize: typography.fontSizeSm, color: colors.textMuted },

  devBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: spacing.sm,
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  devBtnText: { fontSize: typography.fontSizeSm, color: colors.accent, fontWeight: '600' },

  // ── Footer ──
  footer: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
