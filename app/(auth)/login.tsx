/**
 * NeuroFlow — Login / Auth Screen
 * ─────────────────────────────────────────────────────────────────────────────
 * ✅ Dark background (colors.bgBase #0a0a0f)
 * ✅ Centered card layout (matches reference design)
 * ✅ All original NeuroFlow content, colors and buttons preserved
 * ✅ Dev Bypass at the very bottom, always visible
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

const GoogleIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"/>
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </Svg>
);

type Mode = 'signin' | 'signup' | 'reset';

const NF_BLUE = '#4A90E2';

const GradientText = (props: any) => {
  if (Platform.OS === 'web') {
    return (
      <Text
        {...props}
        style={[
          props.style,
          {
            backgroundImage: 'linear-gradient(to right, #4A90E2, #00C6FF)',
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
        colors={['#4A90E2', '#00C6FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text {...props} style={[props.style, { opacity: 0 }]} />
      </LinearGradient>
    </MaskedView>
  );
};

export default function LoginScreen() {
  const { signInWithEmail, signUp, resetPassword, signInWithGoogle, devBypass } = useAuth();
  const { width } = useWindowDimensions();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isGoogleHovered, setIsGoogleHovered] = useState(false);

  // Animated values
  const heroOpacity    = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(-16)).current;
  const orbScale       = useRef(new Animated.Value(0.9)).current;
  const orbOpacity     = useRef(new Animated.Value(0.5)).current;
  const formOpacity    = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(16)).current;
  const orbLoop        = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity,    { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(heroTranslateY, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    orbLoop.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orbScale,   { toValue: 1.08, duration: 2200, useNativeDriver: true }),
          Animated.timing(orbOpacity, { toValue: 1.0,  duration: 2200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(orbScale,   { toValue: 0.9, duration: 2200, useNativeDriver: true }),
          Animated.timing(orbOpacity, { toValue: 0.5, duration: 2200, useNativeDriver: true }),
        ]),
      ]),
    );
    orbLoop.current.start();

    Animated.parallel([
      Animated.timing(formOpacity,    { toValue: 1, duration: 500, delay: 500, useNativeDriver: true }),
      Animated.timing(formTranslateY, { toValue: 0, duration: 500, delay: 500, useNativeDriver: true }),
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

  // Card: max 440px on desktop, full-width (minus padding) on mobile
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
          {/* ── Centered card ── */}
          <View style={[styles.card, { width: cardWidth }]}>

            {/* ── Branded header: text centered above pulse, logo absolutely positioned to the left ── */}
            <View style={styles.brandRow}>
              <View style={styles.brandLogoContainer}>
                <Image
                  source={require('../../assets/elk-logo.jpg')}
                  style={styles.brandLogo}
                />
              </View>
              <GradientText style={styles.brandName}>NeuroFlow</GradientText>
            </View>

            {/* ── Hero ── */}
            <Animated.View style={[styles.hero, { opacity: heroOpacity, transform: [{ translateY: heroTranslateY }] }]}>
              <Animated.View style={[styles.orb, { opacity: orbOpacity, transform: [{ scale: orbScale }] }]} />
              <Text style={[styles.appName, { fontSize: cardWidth >= 400 ? 28 : 22 }]}>Welcome to NeuroFlow</Text>
              <Text style={styles.tagline}>Your calm ADHD companion</Text>
            </Animated.View>

            {/* ── Form ── */}
            <Animated.View style={[styles.formArea, { opacity: formOpacity, transform: [{ translateY: formTranslateY }] }]}>
              
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

              {/* Primary action */}
              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitBtnText}>{buttonLabel}</Text>
                }
              </TouchableOpacity>

              {/* OR Separator */}
              {mode !== 'reset' && (
                <View style={styles.separatorContainer}>
                  <View style={styles.separatorLine} />
                  <Text style={styles.separatorText}>OR</Text>
                  <View style={styles.separatorLine} />
                </View>
              )}

              {/* Continue with Google */}
              {mode !== 'reset' && (
                <Pressable 
                  onPress={handleGoogleSignIn}
                  onHoverIn={() => setIsGoogleHovered(true)}
                  onHoverOut={() => setIsGoogleHovered(false)}
                  style={({ pressed }: any) => [
                    styles.googleBtn,
                    pressed && styles.googleBtnPressed
                  ]}
                >
                  {isGoogleHovered && (
                    <LinearGradient
                      colors={['#4A90E2', '#00C6FF']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[StyleSheet.absoluteFillObject, { opacity: 0.1 }]}
                    />
                  )}
                  <View style={styles.googleBtnContent}>
                    <GoogleIcon />
                    <Text style={styles.googleBtnText}>Sign in with Google</Text>
                  </View>
                </Pressable>
              )}

              {/* Bottom Nav Links */}
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
            </Animated.View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgBase },
  kav:  { flex: 1 },

  // Centers the card vertically and horizontally
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },

  // Card container
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },

  // Branded header row — centered above the pulse orb
  brandRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginBottom: spacing.lg,
  },
  brandLogoContainer: {
    position: 'absolute',
    right: '50%',
    marginRight: 65,
    top: 10,
  },
  brandLogo: {
    width: 28,
    height: 28,
    borderRadius: 24,
    overflow: 'hidden',
  },
  brandName: {
    fontSize: typography.fontSizeXl,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Hero
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  orb: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    backgroundColor: NF_BLUE,
    marginBottom: spacing.md,
    shadowColor: NF_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 40,
    elevation: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  tagline: {
    fontSize: typography.fontSizeLg,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Form
  formArea: { gap: 10 },

  inputGroup: {
    gap: 6,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: typography.fontSizeSm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 2,
  },

  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.fontSizeMd,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText:   { fontSize: typography.fontSizeXs, color: colors.error,   textAlign: 'center' },
  messageText: { fontSize: typography.fontSizeXs, color: colors.success, textAlign: 'center' },

  submitBtn: {
    backgroundColor: NF_BLUE,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
    shadowColor: NF_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnText: { fontSize: typography.fontSizeMd, fontWeight: '700', color: '#fff' },

  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  separatorText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
  },

  googleBtn: {
    backgroundColor: '#1E1E22',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  googleBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  googleBtnPressed: {
    opacity: 0.8,
  },
  googleBtnText: { 
    fontSize: typography.fontSizeMd, 
    fontWeight: '600', 
    color: '#fff' 
  },

  bottomLinksContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: 8,
  },
  bottomLinkText: {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  bottomLinkSeparator: {
    fontSize: typography.fontSizeSm,
    color: colors.textMuted,
  },

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
});
