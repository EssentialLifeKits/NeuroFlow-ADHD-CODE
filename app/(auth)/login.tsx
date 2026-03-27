/**
 * NeuroFlow — Immersive Hero Login
 * ─────────────────────────────────────────────────────────────────────────────
 * PIXEL-PERFECT port of G-Logic signin.html → React Native / Expo Web
 *
 * Exact G-Logic measurements, adapted to NeuroFlow brand:
 *   Orb:         140×140px  (mobile: 110×110px) — same as G-Logic
 *   Orb ring 1:  inset -20px (border radius 50%, pulse animated)
 *   Orb ring 2:  inset -40px (border radius 50%, offset pulse)
 *   Headline:    clamp(2rem, 5vw, 3.2rem) → 32–51px, weight 900
 *   Tagline:     clamp(0.95rem, 2vw, 1.1rem) → 15–18px
 *   Badge:       padding 7px 16px, font 0.78rem (12.5px)
 *   Card:        max 420px, padding 36px 32px, radius 24px
 *   Glassmorphism: backdrop-filter blur(40px) saturate(1.5)
 *   Nav:         fixed, blur(20px), logo 34×34px, badge gradient text
 *   Ambient:     3 blobs — 700px (top-right), 600px (bottom-left), 400px (center)
 *   Particles:   18 floating dots, 2–7px, random drift 120px
 *   Grid:        60×60px mesh, 4% opacity lines
 *
 * Colors swapped: G-Logic orange/pink/purple → NeuroFlow blue/cyan/purple
 *   #f58529 / #dd2a7b / #8134af  →  #4A90E2 / #00C6FF / #7B5EA7
 *
 * Auth preserved: email ✅  Google OAuth ✅  reset ✅  signup ✅  devBypass ✅
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

// ─── NeuroFlow brand (swapped from G-Logic orange→blue, pink→cyan, purple stays) ──
const NF_1    = '#4A90E2';   // primary blue   (was #f58529 orange)
const NF_2    = '#00C6FF';   // cyan            (was #dd2a7b pink)
const NF_3    = '#7B5EA7';   // purple          (same family as #8134af)
const NF_BG   = '#0d0d14';   // exact G-Logic background

// ─── Google icon ───────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
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
            // G-Logic used 135deg; same angle, NeuroFlow colors
            backgroundImage: `linear-gradient(135deg, ${NF_1}, ${NF_2}, ${NF_3})`,
            backgroundSize: '200%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            // Shimmer animation — mirrors G-Logic hp-shimmer keyframes
            animation: 'nf-shimmer 4s linear infinite',
          } as any,
        ]}
      />
    );
  }
  return (
    <MaskedView maskElement={<Text {...props} />}>
      <LinearGradient colors={[NF_1, NF_2, NF_3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text {...props} style={[props.style, { opacity: 0 }]} />
      </LinearGradient>
    </MaskedView>
  );
};

// ─── Feature badge (G-Logic hp-badge) ─────────────────────────────────────────
const Badge = ({ label }: { label: string }) => (
  <View style={badgeS.wrap}>
    <View style={badgeS.dot} />
    <Text style={badgeS.text}>{label}</Text>
  </View>
);
const badgeS = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    // web: backdrop-filter blur(10px)
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(10px)' } as any : {}),
  },
  // G-Logic: 6px gradient dot with glow
  dot: {
    width: 6,
    height: 6,
    borderRadius: 50,
    backgroundColor: NF_1,
    ...(Platform.OS === 'web'
      ? { boxShadow: `0 0 6px ${NF_1}80` } as any
      : {
          shadowColor: NF_1,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 3,
        }),
  },
  text: { fontSize: 12.5, fontWeight: '500', color: 'rgba(255,255,255,0.65)' },
});

// ─── Web-only shimmer keyframe injection ───────────────────────────────────────
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const id = 'nf-shimmer-style';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes nf-shimmer {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes nf-ring-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.3; transform: scale(1.06); }
      }
      @keyframes nf-orb-pulse {
        0%   { transform: scale(0.96); }
        50%  { transform: scale(1.02); }
        100% { transform: scale(0.96); }
      }
      @keyframes nf-entrance {
        from { opacity: 0; transform: translateY(24px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes nf-float {
        0%   { opacity: 0; transform: translateY(0) scale(0); }
        10%  { opacity: 0.6; }
        90%  { opacity: 0.2; }
        100% { opacity: 0; transform: translateY(-120px) scale(1); }
      }
      @keyframes nf-drift1 {
        0%, 100% { transform: translate(0, 0); }
        50%      { transform: translate(-40px, 50px); }
      }
      @keyframes nf-drift2 {
        0%, 100% { transform: translate(0, 0); }
        50%      { transform: translate(40px, -30px); }
      }
      @keyframes nf-drift3 {
        0%, 100% { transform: translateX(-50%) translateY(0); }
        50%      { transform: translateX(-50%) translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { signInWithEmail, signUp, resetPassword, signInWithGoogle, devBypass } = useAuth();
  const { width } = useWindowDimensions();

  const [mode,          setMode]          = useState<Mode>('signin');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [message,       setMessage]       = useState<string | null>(null);
  const [googleHovered, setGoogleHovered] = useState(false);
  const [badgeHovered,  setBadgeHovered]  = useState<number | null>(null);

  // Orb pulse — mirrors G-Logic @keyframes hp-orb-pulse (3.5s)
  const orbScale   = useRef(new Animated.Value(0.96)).current;
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Op    = useRef(new Animated.Value(1)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Op    = useRef(new Animated.Value(1)).current;

  // Entrance anims — mirrors G-Logic hp-entrance (0.8s cubic-bezier(0.34,1.56,0.64,1))
  const heroOp = useRef(new Animated.Value(0)).current;
  const heroTY = useRef(new Animated.Value(24)).current;
  const cardOp = useRef(new Animated.Value(0)).current;
  const cardTY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    // Hero entrance
    Animated.parallel([
      Animated.timing(heroOp, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(heroTY,  { toValue: 0, speed: 14, bounciness: 8, useNativeDriver: true }),
    ]).start();

    // Card entrance (0.4s delay)
    Animated.parallel([
      Animated.timing(cardOp, { toValue: 1, duration: 800, delay: 400, useNativeDriver: true }),
      Animated.spring(cardTY,  { toValue: 0, speed: 14, bounciness: 8, delay: 400, useNativeDriver: true } as any),
    ]).start();

    // Orb pulse loop — G-Logic 3.5s
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, { toValue: 1.02, duration: 1750, useNativeDriver: true }),
        Animated.timing(orbScale, { toValue: 0.96, duration: 1750, useNativeDriver: true }),
      ]),
    );
    pulse.start();

    // Ring 1 pulse — G-Logic 3.5s
    const ring1 = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ring1Scale, { toValue: 1.06, duration: 1750, useNativeDriver: true }),
          Animated.timing(ring1Op,    { toValue: 0.3,  duration: 1750, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ring1Scale, { toValue: 1,    duration: 1750, useNativeDriver: true }),
          Animated.timing(ring1Op,    { toValue: 1,    duration: 1750, useNativeDriver: true }),
        ]),
      ]),
    );
    ring1.start();

    // Ring 2 pulse — 0.5s offset
    setTimeout(() => {
      const ring2 = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ring2Scale, { toValue: 1.06, duration: 1750, useNativeDriver: true }),
            Animated.timing(ring2Op,    { toValue: 0.3,  duration: 1750, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(ring2Scale, { toValue: 1,    duration: 1750, useNativeDriver: true }),
            Animated.timing(ring2Op,    { toValue: 1,    duration: 1750, useNativeDriver: true }),
          ]),
        ]),
      );
      ring2.start();
    }, 500);

    return () => { pulse.stop(); ring1.stop(); };
  }, []);

  const switchMode = (next: Mode) => { setMode(next); setError(null); setMessage(null); };

  const handleSubmit = async () => {
    setError(null); setMessage(null);
    if (!email.trim())                 { setError('Please enter your email.'); return; }
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
    mode === 'signin' ? 'Sign In'
  : mode === 'signup' ? 'Create Account'
  :                     'Send Reset Link';

  // G-Logic card: max-width 420px. Nav is fixed at top, content pads 120px top.
  const cardWidth  = Math.min(width - 32, 420);
  // G-Logic orb: 140px desktop, 110px mobile
  const ORB        = width < 600 ? 110 : 140;
  const RING1_INSET = ORB + 40;   // orb + 20px each side
  const RING2_INSET = ORB + 80;   // orb + 40px each side

  return (
    <View style={styles.root}>

      {/* ══ BACK LAYER — exact G-Logic radial gradients ══════════════════════ */}
      {Platform.OS === 'web' && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
        >
          {/* G-Logic .hp-bg — 3 radial gradients on #0d0d14 */}
          <View
            style={[StyleSheet.absoluteFillObject, {
              background: `
                radial-gradient(ellipse 80% 60% at 50% -10%, rgba(74,144,226,0.18) 0%, transparent 70%),
                radial-gradient(ellipse 60% 50% at 90% 80%, rgba(123,94,167,0.14) 0%, transparent 60%),
                radial-gradient(ellipse 50% 40% at 10% 70%, rgba(0,198,255,0.10) 0%, transparent 60%),
                #0d0d14
              `,
            } as any]}
          />

          {/* G-Logic .hp-grid — 60px mesh, 4% opacity */}
          <View
            style={[StyleSheet.absoluteFillObject, {
              backgroundImage: `
                linear-gradient(rgba(74,144,226,0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(74,144,226,0.04) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
              maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
            } as any]}
          />

          {/* G-Logic .hp-ambient-1 — 700px, top-right, 12s drift */}
          <View style={[styles.ambientBlob, {
            width: 700, height: 700, top: -200, right: -150,
            backgroundColor: 'rgba(74,144,226,0.12)',
            filter: 'blur(140px)',
            animation: 'nf-drift1 12s ease-in-out infinite',
          } as any]} />

          {/* G-Logic .hp-ambient-2 — 600px, bottom-left, 15s drift */}
          <View style={[styles.ambientBlob, {
            width: 600, height: 600, bottom: -200, left: -150,
            backgroundColor: 'rgba(123,94,167,0.10)',
            filter: 'blur(120px)',
            animation: 'nf-drift2 15s ease-in-out infinite',
          } as any]} />

          {/* G-Logic .hp-ambient-3 — 400px, center, 18s drift */}
          <View style={[styles.ambientBlob, {
            width: 400, height: 400, top: '40%', left: '50%',
            marginLeft: -200,
            backgroundColor: 'rgba(0,198,255,0.08)',
            filter: 'blur(100px)',
            animation: 'nf-drift3 18s ease-in-out infinite',
          } as any]} />

          {/* G-Logic .hp-particles — 18 floating dots (web-only via JS injection) */}
          <View
            id="nf-particles"
            style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' } as any]}
          />
        </View>
      )}

      {/* ══ NAV — fixed top bar (G-Logic .hp-nav) ════════════════════════════ */}
      <View
        style={[
          styles.nav,
          Platform.OS === 'web'
            ? ({
                position: 'fixed',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              } as any)
            : {},
        ]}
      >
        {/* Left: logo + brand name */}
        <View style={styles.navBrand}>
          <Image source={require('../../assets/elk-logo.jpg')} style={styles.navLogo} />
          {/* G-Logic: weight 800, 1.1rem, gradient text */}
          <GradientText style={styles.navBrandText}>NeuroFlow ADHD</GradientText>
        </View>

        {/* Right: badge (G-Logic: gradient text + border) */}
        {/* G-Logic used "Instagram Planning Suite" — NeuroFlow equivalent: */}
        <View style={styles.navBadgeWrap}>
          <GradientText style={styles.navBadgeText}>Focus & Flow Suite</GradientText>
        </View>
      </View>

      {/* ══ CONTENT ══════════════════════════════════════════════════════════ */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, zIndex: 10 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            // G-Logic .hp-content: padding 120px top (for fixed nav), 60px bottom
            { paddingTop: 120, paddingBottom: 60, paddingHorizontal: 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── G-Logic .hp-orb-wrap: 140×140px + entrance anim ── */}
          <Animated.View
            style={[
              { alignItems: 'center', marginBottom: 36 },
              { opacity: heroOp, transform: [{ translateY: heroTY }] },
            ]}
          >
            {/* Ring 2 — inset -40px = RING2_INSET wide */}
            <Animated.View
              style={[
                styles.orbRing,
                {
                  width:        RING2_INSET,
                  height:       RING2_INSET,
                  borderRadius: RING2_INSET / 2,
                  borderColor:  `rgba(74,144,226,0.10)`,
                  position:     'absolute',
                  top:          (ORB - RING2_INSET) / 2,
                  opacity:      ring2Op,
                  transform:    [{ scale: ring2Scale }],
                },
              ]}
            />

            {/* Ring 1 — inset -20px = RING1_INSET wide */}
            <Animated.View
              style={[
                styles.orbRing,
                {
                  width:        RING1_INSET,
                  height:       RING1_INSET,
                  borderRadius: RING1_INSET / 2,
                  borderColor:  `rgba(74,144,226,0.20)`,
                  position:     'absolute',
                  top:          (ORB - RING1_INSET) / 2,
                  opacity:      ring1Op,
                  transform:    [{ scale: ring1Scale }],
                },
              ]}
            />

            {/* G-Logic .hp-orb: 140px, gradient, 3-layer box-shadow, pulse 3.5s */}
            <Animated.View
              style={[
                {
                  width:        ORB,
                  height:       ORB,
                  borderRadius: ORB / 2,
                  overflow:     'hidden',
                  transform:    [{ scale: orbScale }],
                  // G-Logic box-shadow converted to RN shadow (color-matched, NO black)
                  shadowColor:  NF_2,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius:  40,
                  elevation:     20,
                  ...(Platform.OS === 'web'
                    ? {
                        boxShadow: `
                          0 0 40px  rgba(74,144,226,0.50),
                          0 0 80px  rgba(0,198,255,0.25),
                          0 0 120px rgba(123,94,167,0.15)
                        `,
                      } as any
                    : {}),
                },
              ]}
            >
              {/* G-Logic: linear-gradient(135deg, #f58529, #dd2a7b, #8134af)
                  NeuroFlow: linear-gradient(135deg, #4A90E2, #00C6FF, #7B5EA7) */}
              <LinearGradient
                colors={[NF_1, NF_2, NF_3]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {/* G-Logic ::after — inner highlight: radial white glint top-left */}
              <View
                style={{
                  position:     'absolute',
                  inset:        0,
                  borderRadius: ORB / 2,
                  background:   'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.25) 0%, transparent 60%)',
                } as any}
              />
            </Animated.View>
          </Animated.View>

          {/* ── G-Logic .hp-headline: clamp(2rem,5vw,3.2rem), weight 900 ── */}
          <Animated.View
            style={[
              { alignItems: 'center' },
              { opacity: heroOp, transform: [{ translateY: heroTY }] },
            ]}
          >
            <Text style={styles.headline}>Welcome to</Text>
            {/* G-Logic .hp-headline-accent: shimmer gradient */}
            <GradientText style={styles.headlineAccent}>NeuroFlow ADHD</GradientText>

            {/* G-Logic .hp-tagline: clamp(0.95rem,2vw,1.1rem), 50% white */}
            <Text style={styles.tagline}>
              The all-in-one calm ADHD companion — focus sessions, smart reminders,
              and routines designed for how your brain actually works.
            </Text>

            {/* G-Logic .hp-badges: flex wrap, gap 10px, margin-bottom 48px */}
            <View style={styles.badgesRow}>
              {[
                '🧠 Focus Mode',
                '✅ Task Engine',
                '⚡ AI-Powered',
                '🔔 Smart Reminders',
              ].map((label, i) => (
                <Badge key={i} label={label} />
              ))}
            </View>
          </Animated.View>

          {/* ── G-Logic .hp-glass-card ──────────────────────────────────────── */}
          <Animated.View
            style={[
              styles.card,
              { width: cardWidth },
              { opacity: cardOp, transform: [{ translateY: cardTY }] },
              Platform.OS === 'web'
                ? ({
                    backdropFilter: 'blur(40px) saturate(1.5)',
                    WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
                  } as any)
                : {},
            ]}
          >
            {/* G-Logic .hp-glass-card::before — top gradient border line */}
            {Platform.OS === 'web' && (
              <View style={[styles.cardTopLine, {
                background: `linear-gradient(90deg, transparent, rgba(74,144,226,0.4), rgba(0,198,255,0.4), transparent)`,
              } as any]} />
            )}

            {/* Card brand row — G-Logic auth-logo: logo 28px + gradient brand name */}
            <View style={styles.cardBrand}>
              <Image source={require('../../assets/elk-logo.jpg')} style={styles.cardLogo} />
              <GradientText style={styles.cardBrandText}>NeuroFlow</GradientText>
            </View>

            {/* Error / message */}
            {error   ? <Text style={styles.errorText}>{error}</Text>   : null}
            {message ? <Text style={styles.msgText}>{message}</Text>   : null}

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,0.25)"
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
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
            )}

            {/* Sign In — G-Logic: gradient button, same style */}
            <LinearGradient
              colors={[NF_1, NF_2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.signInGrad, loading && { opacity: 0.6 }]}
            >
              <TouchableOpacity
                style={styles.signInInner}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.signInText}>{buttonLabel}</Text>
                }
              </TouchableOpacity>
            </LinearGradient>

            {/* OR divider */}
            {mode !== 'reset' && (
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
            )}

            {/* Google — G-Logic: dark bg, border, Google SVG + text */}
            {mode !== 'reset' && (
              <Pressable
                onPress={handleGoogleSignIn}
                onHoverIn={() => setGoogleHovered(true)}
                onHoverOut={() => setGoogleHovered(false)}
                style={({ pressed }: any) => [
                  styles.googleBtn,
                  pressed         && { opacity: 0.8 },
                  googleHovered   && styles.googleHover,
                ]}
              >
                <View style={styles.googleInner}>
                  <GoogleIcon />
                  <Text style={styles.googleText}>Sign in with Google</Text>
                </View>
              </Pressable>
            )}

            {/* Bottom links — G-Logic: auth-links */}
            {mode !== 'reset' ? (
              <View style={styles.authLinks}>
                <TouchableOpacity onPress={() => switchMode('reset')}>
                  <Text style={styles.authLink}>Lost Password?</Text>
                </TouchableOpacity>
                <Text style={styles.authDot}>·</Text>
                <TouchableOpacity onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
                  <Text style={styles.authLink}>{mode === 'signin' ? 'Create Account' : 'Sign In'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.authLinks}>
                <TouchableOpacity onPress={() => switchMode('signin')}>
                  <Text style={styles.authLink}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Dev bypass */}
            {__DEV__ && (
              <TouchableOpacity onPress={devBypass} style={styles.devBtn} activeOpacity={0.8}>
                <Text style={styles.devText}>⚡ Dev Bypass</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Footer — G-Logic .hp-footer */}
          <Text style={styles.footer}>
            Trusted by focused minds everywhere ✨  ·  Privacy  ·  Terms
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Particle injector — web only, mirrors G-Logic's 18-particle JS */}
      {Platform.OS === 'web' && (
        <ParticleInjector />
      )}
    </View>
  );
}

// ─── Web particle injector (mirrors G-Logic's inline script exactly) ───────────
function ParticleInjector() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('nf-particles');
    if (!container || container.childElementCount > 0) return;
    const count = 18;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const size = Math.random() * 5 + 2;
      // G-Logic: duration 6–14s, delay 0–8s, drift 120px
      Object.assign(p.style, {
        position:          'absolute',
        borderRadius:      '50%',
        background:        `linear-gradient(135deg, ${NF_1}, ${NF_2})`,
        opacity:           '0',
        width:             size + 'px',
        height:            size + 'px',
        left:              (Math.random() * 100) + '%',
        bottom:            (Math.random() * 60) + '%',
        animationName:     'nf-float',
        animationDuration: (Math.random() * 8 + 6) + 's',
        animationDelay:    (Math.random() * 8) + 's',
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
        pointerEvents:     'none',
      });
      container.appendChild(p);
    }
  }, []);
  return null;
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  root: { flex: 1, backgroundColor: NF_BG },

  // ── Ambient blobs (positioned via inline style) ──
  ambientBlob: { position: 'absolute', borderRadius: 9999 },

  // ── Nav — G-Logic .hp-nav ──────────────────────────────────────────────────
  nav: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingVertical:  20,
    paddingHorizontal: 40,
    backgroundColor:  'rgba(13,13,20,0.5)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    zIndex:           100,
    top: 0, left: 0, right: 0,
  },
  navBrand:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogo:      { width: 34, height: 34, borderRadius: 99, overflow: 'hidden' },
  navBrandText: { fontWeight: '800', fontSize: 17.6, letterSpacing: -0.35 },

  navBadgeWrap: {
    borderWidth:   1,
    borderColor:   `rgba(74,144,226,0.20)`,
    borderRadius:  100,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  navBadgeText: {
    fontSize:     11.5,
    fontWeight:   '600',
    letterSpacing: 0.06 * 11,
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: {
    flexGrow:   1,
    alignItems: 'center',
    width:      '100%',
  },

  // ── Orb ring (G-Logic .hp-orb-ring) ───────────────────────────────────────
  orbRing: {
    borderWidth: 1,
    position:    'absolute',
  },

  // ── Headline (G-Logic .hp-headline) ───────────────────────────────────────
  headline: {
    // clamp(2rem, 5vw, 3.2rem) → 32px–51px
    fontSize:      40,
    fontWeight:    '900',
    letterSpacing: -0.04 * 40,
    lineHeight:    44,
    color:         '#ffffff',
    textAlign:     'center',
    marginBottom:  4,
  },
  headlineAccent: {
    // G-Logic: same size as headline, gradient, shimmer
    fontSize:      40,
    fontWeight:    '900',
    letterSpacing: -0.04 * 40,
    lineHeight:    44,
    textAlign:     'center',
    marginBottom:  16,
  },

  // ── Tagline (G-Logic .hp-tagline) ─────────────────────────────────────────
  tagline: {
    // clamp(0.95rem, 2vw, 1.1rem) → ~15–18px
    fontSize:     16,
    color:        'rgba(255,255,255,0.50)',
    fontWeight:   '400',
    lineHeight:   25.6,
    maxWidth:     500,
    textAlign:    'center',
    marginBottom: 32,
  },

  // ── Badges row (G-Logic .hp-badges) ───────────────────────────────────────
  badgesRow: {
    flexDirection:   'row',
    flexWrap:        'wrap',
    justifyContent:  'center',
    alignItems:      'center',
    gap:             10,
    marginBottom:    48,
  },

  // ── Glassmorphism card (G-Logic .hp-glass-card) ───────────────────────────
  card: {
    backgroundColor:  'rgba(255,255,255,0.03)',
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.08)',
    borderRadius:     24,
    padding:          0,       // padding applied inside each section
    paddingVertical:  36,
    paddingHorizontal: 32,
    position:         'relative',
    // G-Logic card shadow: 0 24px 80px black 60%, 0 8px 32px brand 8%
    shadowColor:      NF_1,
    shadowOffset:     { width: 0, height: 24 },
    shadowOpacity:    0.08,
    shadowRadius:     40,
    elevation:        16,
    gap:              14,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: `
            0 0 0 1px rgba(74,144,226,0.06),
            0 24px 80px rgba(0,0,0,0.60),
            0 8px  32px rgba(74,144,226,0.08),
            inset 0 1px 0 rgba(255,255,255,0.06)
          `,
        } as any
      : {}),
  },

  // Top gradient border line (::before)
  cardTopLine: {
    position:     'absolute',
    top:          0,
    left:         '20%',
    right:        '20%',
    height:       1,
    borderRadius: 1,
  } as any,

  // Card brand row
  cardBrand:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  cardLogo:      { width: 28, height: 28, borderRadius: 99, overflow: 'hidden' },
  cardBrandText: { fontWeight: '800', fontSize: 16 },

  errorText: { fontSize: 12, color: '#F87171', textAlign: 'center' },
  msgText:   { fontSize: 12, color: '#34D399', textAlign: 'center' },

  // Input (G-Logic auth-field)
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.55)', marginLeft: 2 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.10)',
    borderRadius:    10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize:        15,
    color:           '#ffffff',
  },

  // Sign In gradient button
  signInGrad:  { borderRadius: 10, overflow: 'hidden' },
  signInInner: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  signInText:  { fontSize: 15, fontWeight: '700', color: '#fff' },

  // OR divider
  divider:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  dividerText: { fontSize: 12, color: 'rgba(255,255,255,0.30)', fontWeight: '500' },

  // Google button
  googleBtn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.08)',
    borderRadius:    10,
    overflow:        'hidden',
  },
  googleHover: {
    borderColor:     `rgba(74,144,226,0.30)`,
    backgroundColor: `rgba(74,144,226,0.06)`,
  },
  googleInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 12 },
  googleText:  { fontSize: 15, fontWeight: '600', color: '#fff' },

  // Bottom links
  authLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  authLink:  { fontSize: 13, color: 'rgba(255,255,255,0.40)', fontWeight: '500' },
  authDot:   { fontSize: 13, color: 'rgba(255,255,255,0.20)' },

  // Dev bypass
  devBtn: {
    alignItems: 'center', paddingVertical: 11,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  devText: { fontSize: 12, color: NF_3, fontWeight: '600' },

  // Footer — G-Logic .hp-footer
  footer: {
    marginTop:    40,
    paddingBottom: 32,
    fontSize:     12.2,
    color:        'rgba(255,255,255,0.20)',
    textAlign:    'center',
  },
});
