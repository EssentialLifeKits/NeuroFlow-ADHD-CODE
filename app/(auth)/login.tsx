/**
 * NeuroFlow — Immersive Hero Login
 * ─────────────────────────────────────────────────────────────────────────────
 * Layout mirrors the G-Logic Hero reference exactly, adapted to NeuroFlow brand.
 *
 * 3-layer composition:
 *   Back  : #0a0a0f base + large ambient blue/cyan glow cloud
 *   Mid   : Giant pulsing gradient orb (fills ~60% screen width) + floating particles
 *   Front : NavBar (logo top-left) → headline → tagline → pills → glassmorphism card
 *
 * Auth: email/password ✅  Google OAuth ✅  reset ✅  signup ✅  devBypass ✅
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
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, spacing, typography } from '../../src/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Path } from 'react-native-svg';

// ─── Brand tokens ──────────────────────────────────────────────────────────────
const NF_BLUE   = '#4A90E2';
const NF_CYAN   = '#00C6FF';
const NF_PURPLE = '#7B5EA7';
const NF_DARK   = '#0a0a0f';

// ─── Particle data ─────────────────────────────────────────────────────────────
const PARTICLES = [
  { left: '12%',  top: '18%', size: 5,  color: NF_BLUE,   delay: 0    },
  { left: '82%',  top: '12%', size: 4,  color: NF_CYAN,   delay: 600  },
  { left: '73%',  top: '55%', size: 6,  color: NF_PURPLE, delay: 1100 },
  { left: '22%',  top: '68%', size: 3,  color: NF_BLUE,   delay: 300  },
  { left: '88%',  top: '42%', size: 5,  color: NF_CYAN,   delay: 900  },
  { left: '8%',   top: '50%', size: 4,  color: NF_PURPLE, delay: 200  },
  { left: '52%',  top: '80%', size: 3,  color: NF_BLUE,   delay: 1400 },
  { left: '38%',  top: '8%',  size: 5,  color: NF_CYAN,   delay: 500  },
];

// ─── Google icon ───────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"/>
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </Svg>
);

// ─── Gradient text ─────────────────────────────────────────────────────────────
type Mode = 'signin' | 'signup' | 'reset';

const GradientText = (props: any) => {
  if (Platform.OS === 'web') {
    return (
      <Text
        {...props}
        style={[
          props.style,
          {
            backgroundImage: `linear-gradient(90deg, ${NF_BLUE}, ${NF_CYAN})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          } as any,
        ]}
      />
    );
  }
  return (
    <MaskedView maskElement={<Text {...props} />}>
      <LinearGradient colors={[NF_BLUE, NF_CYAN]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <Text {...props} style={[props.style, { opacity: 0 }]} />
      </LinearGradient>
    </MaskedView>
  );
};

// ─── Feature pill ──────────────────────────────────────────────────────────────
const FeaturePill = ({ emoji, label }: { emoji: string; label: string }) => (
  <View style={pillStyle.pill}>
    <View style={pillStyle.dot} />
    <Text style={pillStyle.label}>{emoji}  {label}</Text>
  </View>
);
const pillStyle = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(74,144,226,0.30)',
    backgroundColor: 'rgba(74,144,226,0.08)',
  },
  dot:   { width: 6, height: 6, borderRadius: 99, backgroundColor: NF_BLUE },
  label: { fontSize: 12, color: '#b8c6e0', fontWeight: '500' },
});

// ─── Animated floating particle ────────────────────────────────────────────────
const Particle = ({ left, top, size, color, delay }: typeof PARTICLES[0]) => {
  const ty  = useRef(new Animated.Value(0)).current;
  const op  = useRef(new Animated.Value(0.0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ty, { toValue: -12, duration: 2800, delay, useNativeDriver: true }),
          Animated.timing(op, { toValue: 0.7, duration: 1400, delay, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ty, { toValue: 0,  duration: 2800, useNativeDriver: true }),
          Animated.timing(op, { toValue: 0.2, duration: 2800, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: color,
        opacity: op,
        transform: [{ translateY: ty }],
        // web-only glow
        ...(Platform.OS === 'web' ? { boxShadow: `0 0 ${size * 3}px ${color}` } as any : {}),
      }}
    />
  );
};

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { signInWithEmail, signUp, resetPassword, signInWithGoogle, devBypass } = useAuth();
  const { width } = useWindowDimensions();

  const [mode,           setMode]           = useState<Mode>('signin');
  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [message,        setMessage]        = useState<string | null>(null);
  const [googleHovered,  setGoogleHovered]  = useState(false);

  // ── Animated refs ────────────────────────────────────────────────────────────
  const orbScale    = useRef(new Animated.Value(0.90)).current;
  const orbOpacity  = useRef(new Animated.Value(0.80)).current;
  const heroOp      = useRef(new Animated.Value(0)).current;
  const heroTY      = useRef(new Animated.Value(-22)).current;
  const cardOp      = useRef(new Animated.Value(0)).current;
  const cardTY      = useRef(new Animated.Value(28)).current;
  const orbLoop     = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Hero entrance
    Animated.parallel([
      Animated.timing(heroOp, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(heroTY, { toValue: 0, duration: 750, useNativeDriver: true }),
    ]).start();

    // Card entrance
    Animated.parallel([
      Animated.timing(cardOp, { toValue: 1, duration: 600, delay: 500, useNativeDriver: true }),
      Animated.timing(cardTY, { toValue: 0, duration: 600, delay: 500, useNativeDriver: true }),
    ]).start();

    // Orb pulse loop
    orbLoop.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orbScale,   { toValue: 1.08, duration: 2600, useNativeDriver: true }),
          Animated.timing(orbOpacity, { toValue: 1.00, duration: 2600, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(orbScale,   { toValue: 0.90, duration: 2600, useNativeDriver: true }),
          Animated.timing(orbOpacity, { toValue: 0.75, duration: 2600, useNativeDriver: true }),
        ]),
      ]),
    );
    orbLoop.current.start();
    return () => orbLoop.current?.stop();
  }, []);

  const switchMode = (next: Mode) => { setMode(next); setError(null); setMessage(null); };

  const handleSubmit = async () => {
    setError(null); setMessage(null);
    if (!email.trim())            { setError('Please enter your email.'); return; }
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
    mode === 'signin'  ? 'Sign In'
  : mode === 'signup'  ? 'Create Account'
  :                      'Send Reset Link';

  // Responsive sizing
  const cardWidth = Math.min(width - 32, 440);
  // The orb is center-stage: 60% of screen width, up to 300px
  const ORB = Math.min(width * 0.62, 300);

  return (
    <View style={styles.root}>
      {/* ══ BACK LAYER — ambient glow cloud (web gets blur) ══════════════════ */}
      <View
        pointerEvents="none"
        style={[
          styles.ambientBlob,
          {
            width:  ORB * 2.8,
            height: ORB * 2.8,
            borderRadius: ORB * 1.4,
            left: '50%',
            top: 0,
            marginLeft: -(ORB * 1.4),
            marginTop:  -(ORB * 0.55),
          },
          // Web-only: real Gaussian blur makes the glow soft + authentic
          Platform.OS === 'web'
            ? ({ filter: 'blur(90px)' } as any)
            : {},
        ]}
      />

      {/* ══ MID LAYER — particles ════════════════════════════════════════════ */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}
      </View>

      {/* ══ FRONT LAYER — content ════════════════════════════════════════════ */}
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingHorizontal: Math.min((width - cardWidth) / 2, 24) }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── Hero block ─────────────────────────────────────────────── */}
            <Animated.View
              style={[styles.hero, { opacity: heroOp, transform: [{ translateY: heroTY }] }]}
            >
              {/* NavBar */}
              <View style={[styles.navBar, { width: cardWidth }]}>
                <View style={styles.navBrand}>
                  <Image
                    source={require('../../assets/elk-logo.jpg')}
                    style={styles.navLogo}
                  />
                  <GradientText style={styles.navName}>NeuroFlow</GradientText>
                </View>
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>ADHD COMPANION</Text>
                </View>
              </View>

              {/* Giant pulsing orb — NO black shadow, only blue glow */}
              <Animated.View
                style={[
                  styles.orbWrap,
                  {
                    width:        ORB,
                    height:       ORB,
                    borderRadius: ORB / 2,
                    transform:    [{ scale: orbScale }],
                    opacity:      orbOpacity,
                    // Color-matched shadow — NO black
                    shadowColor:  NF_BLUE,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.90,
                    shadowRadius:  ORB * 0.55,
                    elevation:     30,
                    // Web-only: true box glow
                    ...(Platform.OS === 'web'
                      ? { boxShadow: `0 0 ${ORB * 0.7}px ${NF_BLUE}99, 0 0 ${ORB * 0.35}px ${NF_CYAN}66` } as any
                      : {}),
                  },
                ]}
              >
                <LinearGradient
                  colors={[NF_BLUE, NF_CYAN, NF_PURPLE]}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </Animated.View>

              {/* Headline */}
              <Text style={styles.headlineTop}>Welcome to</Text>
              <GradientText style={styles.headlineBrand}>NeuroFlow ADHD</GradientText>
              <Text style={styles.tagline}>
                The all-in-one calm companion — focus sessions, smart reminders, and routines built for the ADHD brain.
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

            {/* ── Glassmorphism auth card ─────────────────────────────────── */}
            <Animated.View
              style={[
                styles.card,
                { width: cardWidth },
                { opacity: cardOp, transform: [{ translateY: cardTY }] },
                // Web glassmorphism
                Platform.OS === 'web'
                  ? ({
                      backdropFilter: 'blur(22px)',
                      WebkitBackdropFilter: 'blur(22px)',
                      backgroundColor: 'rgba(14, 14, 24, 0.60)',
                      borderColor: 'rgba(74,144,226,0.18)',
                    } as any)
                  : {
                      backgroundColor: 'rgba(18, 18, 30, 0.92)',
                      borderColor: 'rgba(74,144,226,0.14)',
                    },
              ]}
            >
              {/* Card brand row */}
              <View style={styles.cardBrand}>
                <Image
                  source={require('../../assets/elk-logo.jpg')}
                  style={styles.cardLogo}
                />
                <GradientText style={styles.cardBrandName}>NeuroFlow</GradientText>
              </View>

              {/* Email */}
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

              {/* Password */}
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
              {message ? <Text style={styles.msgText}>{message}</Text>   : null}

              {/* ── Sign In gradient button ── */}
              <LinearGradient
                colors={[NF_BLUE, NF_CYAN]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.submitGrad, loading && { opacity: 0.6 }]}
              >
                <TouchableOpacity
                  style={styles.submitInner}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.submitText}>{buttonLabel}</Text>
                  }
                </TouchableOpacity>
              </LinearGradient>

              {/* ── OR separator ── */}
              {mode !== 'reset' && (
                <View style={styles.sepRow}>
                  <View style={styles.sepLine} />
                  <Text style={styles.sepText}>OR</Text>
                  <View style={styles.sepLine} />
                </View>
              )}

              {/* ── Google OAuth button ── */}
              {mode !== 'reset' && (
                <Pressable
                  onPress={handleGoogleSignIn}
                  onHoverIn={() => setGoogleHovered(true)}
                  onHoverOut={() => setGoogleHovered(false)}
                  style={({ pressed }: any) => [
                    styles.googleBtn,
                    pressed && { opacity: 0.8 },
                    googleHovered && styles.googleBtnHover,
                  ]}
                >
                  <View style={styles.googleInner}>
                    <GoogleIcon />
                    <Text style={styles.googleText}>Sign in with Google</Text>
                  </View>
                </Pressable>
              )}

              {/* ── Bottom links ── */}
              {mode !== 'reset' ? (
                <View style={styles.bottomLinks}>
                  <TouchableOpacity onPress={() => switchMode('reset')}>
                    <Text style={styles.bottomLink}>Lost Password?</Text>
                  </TouchableOpacity>
                  <Text style={styles.bottomDot}>·</Text>
                  <TouchableOpacity onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
                    <Text style={styles.bottomLink}>{mode === 'signin' ? 'Create Account' : 'Sign In'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.bottomLinks}>
                  <TouchableOpacity onPress={() => switchMode('signin')}>
                    <Text style={styles.bottomLink}>Back to Sign In</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Dev bypass ── */}
              {__DEV__ && (
                <TouchableOpacity onPress={devBypass} style={styles.devBtn} activeOpacity={0.8}>
                  <Text style={styles.devText}>⚡ Dev Bypass</Text>
                </TouchableOpacity>
              )}
            </Animated.View>

            {/* Footer */}
            <Text style={styles.footer}>
              Trusted by focused minds everywhere  ✦  Privacy  ·  Terms
            </Text>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // Root: full-screen dark canvas
  root: { flex: 1, backgroundColor: NF_DARK },

  // Ambient glow blob (positioned absolute via inline style above)
  ambientBlob: {
    position: 'absolute',
    backgroundColor: 'rgba(74,144,226,0.22)',
    // On native this just creates a soft diffuse tint; web uses blur() filter
  },

  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 40,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
    marginBottom: 32,
  },

  // NavBar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 36,
    width: '100%',
  },
  navBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    overflow: 'hidden',
  },
  navName: {
    fontSize: 17,
    fontWeight: '700',
  },
  navBadge: {
    backgroundColor: 'rgba(74,144,226,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74,144,226,0.32)',
    borderRadius: 99,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  navBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: NF_BLUE,
    letterSpacing: 1.2,
  },

  // Giant orb (size/shadow set inline)
  orbWrap: {
    overflow: 'hidden',
    marginBottom: 28,
  },

  // Headline
  headlineTop: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f0f0f5',
    textAlign: 'center',
    marginBottom: 2,
  },
  headlineBrand: {
    fontSize: 38,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.6,
    marginBottom: 14,
  },
  tagline: {
    fontSize: 14,
    color: '#8b8b9e',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 360,
    marginBottom: 22,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },

  // ── Glassmorphism card ─────────────────────────────────────────────────────
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 28,
    gap: 12,
    // Color-matched shadow (NO black)
    shadowColor: NF_BLUE,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 14,
    marginBottom: 20,
  },

  // Card brand row
  cardBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardLogo: {
    width: 26,
    height: 26,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardBrandName: {
    fontSize: 17,
    fontWeight: '700',
  },

  // Inputs
  inputGroup: { gap: 5 },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b8b9e',
    marginLeft: 2,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#f0f0f5',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  errorText: { fontSize: 12, color: '#F87171', textAlign: 'center' },
  msgText:   { fontSize: 12, color: '#34D399', textAlign: 'center' },

  // Sign In gradient button
  submitGrad: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  submitInner: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // OR separator
  sepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  sepLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  sepText: {
    color: '#5c5c72',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 14,
  },

  // Google button
  googleBtn: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  googleBtnHover: {
    borderColor: 'rgba(74,144,226,0.40)',
    backgroundColor: 'rgba(74,144,226,0.06)',
  },
  googleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  googleText: { fontSize: 15, fontWeight: '600', color: '#f0f0f5' },

  // Bottom links
  bottomLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  bottomLink: { fontSize: 13, color: '#8b8b9e', fontWeight: '500' },
  bottomDot:  { fontSize: 13, color: '#5c5c72' },

  // Dev bypass
  devBtn: {
    alignItems: 'center',
    paddingVertical: 11,
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  devText: { fontSize: 12, color: '#8134AF', fontWeight: '600' },

  // Footer
  footer: {
    fontSize: 12,
    color: '#5c5c72',
    textAlign: 'center',
    marginTop: 8,
  },
});
