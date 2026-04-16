/**
 * NeuroFlow — Sidebar
 * ✅ Desktop (width > 1024): permanent fixed left column, no overlay
 * ✅ Mobile (width ≤ 1024): animated slide-out with dark overlay
 * ✅ All existing nav, user info, affiliate, sign-out preserved
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Linking,
    Pressable,
    StyleSheet,
    Text,
    View,
    Image,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { colors, radius } from '../constants/theme';
import { useAuth } from '../lib/auth';
import { getAllSettings } from '../lib/adminDb';

const MOBILE_SIDEBAR_W = 280;
const NF_BLUE = '#4A90E2';
const NF_BLUE_DARK = '#0056b3';
const NF_BLUE_MID = '#1A6DBE';

export interface SidebarProps {
    visible: boolean;
    onClose: () => void;
    isDesktop?: boolean;
}

const NAV_ITEMS = [
    { label: 'Dashboard', path: '/(app)', icon: '🏠' },
    { label: 'Calendar', path: '/(app)/calendar', icon: '📅' },
    { label: 'Focus', path: '/(app)/focus', icon: '🪷' },
    { label: 'Resources', path: '/(app)/resources', icon: '📚' },
];

function NFLogo({ size = 28 }: { size?: number }) {
    return (
        <Image
            source={require('../../assets/neuroflow-logo.jpg')}
            style={{ width: size, height: size, borderRadius: size * 0.25 }}
        />
    );
}

function resolveUserName(email: string | null | undefined, raw: string | null | undefined): string {
    if (!email) return raw ?? 'NeuroFlow User';
    const lower = email.toLowerCase().trim();
    if (lower === 'essentiallifekits@gmail.com') return 'Essential Life Kits';
    const local = email.split('@')[0];
    return local
        .replace(/[._-]/g, ' ')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

function resolveInitials(name: string): string {
    return name.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('');
}

// ── Shared panel content ──────────────────────────────────────────────────────
function SidebarContent({ isDesktop, onClose }: { isDesktop: boolean; onClose: () => void }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, signOut } = useAuth();

    const userEmail = user?.email as string | undefined;
    const rawDisplayName = user?.user_metadata?.full_name
      ?? user?.user_metadata?.name
      ?? undefined;
    const displayName = resolveUserName(userEmail, rawDisplayName);
    const initials = resolveInitials(displayName);

    // Affiliate card — loaded from DB settings
    const [affVisible, setAffVisible] = useState(false);
    const [affIcon,    setAffIcon]    = useState('⚡');
    const [affTitle,   setAffTitle]   = useState('Featured Affiliate');
    const [affSub,     setAffSub]     = useState('Supercharge your focus flow');
    const [affLink,    setAffLink]    = useState('');
    const [affBadge,   setAffBadge]   = useState('Soon');

    useEffect(() => {
        getAllSettings().then(s => {
            setAffVisible(s['affiliate_visible'] === 'true');
            if (s['affiliate_icon'])  setAffIcon(s['affiliate_icon']);
            if (s['affiliate_title']) setAffTitle(s['affiliate_title']);
            if (s['affiliate_sub'])   setAffSub(s['affiliate_sub']);
            if (s['affiliate_link'])  setAffLink(s['affiliate_link']);
            if (s['affiliate_badge'] !== undefined) setAffBadge(s['affiliate_badge']);
        }).catch(() => {});
    }, []);

    const navigateTo = (path: string) => {
        if (!isDesktop) onClose();
        setTimeout(() => router.push(path as any), isDesktop ? 0 : 160);
    };

    const handleSignOut = async () => {
        if (!isDesktop) onClose();
        await signOut();
    };

    const isNavActive = (itemPath: string): boolean => {
        if (itemPath === '/(app)') {
            return pathname === '/' || pathname === '' || pathname === '/(app)' || pathname === '/(app)/index';
        }
        return pathname === itemPath || pathname.startsWith(itemPath + '/');
    };

    const handleAffiliatePress = () => {
        if (affLink) {
            Linking.openURL(affLink).catch(() => {});
        }
    };

    return (
        <>
            {/* Blue header */}
            <View style={[styles.gradientHeader, isDesktop && styles.gradientHeaderDesktop]}>
                <View style={styles.logoArea}>
                    <NFLogo size={32} />
                    <Text style={styles.logoText}>NeuroFlow</Text>
                </View>
                <View style={styles.headerUserArea}>
                    <View style={styles.headerAvatar}>
                        <Text style={styles.headerAvatarText}>{initials || displayName[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerUserName} numberOfLines={1}>{displayName}</Text>
                        <Text style={styles.headerUserPlan}>NeuroFlow Pro ✨</Text>
                    </View>
                </View>
            </View>

            {/* Nav */}
            <View style={styles.navArea}>
                {NAV_ITEMS.map((item) => {
                    const isActive = isNavActive(item.path);
                    return (
                        <Pressable
                            key={item.label}
                            style={({ pressed }) => [
                                styles.navItem,
                                isActive && styles.navItemActive,
                                pressed && styles.navItemPressed,
                            ]}
                            onPress={() => navigateTo(item.path)}
                        >
                            {isActive && <View style={styles.navActiveBar} />}
                            <Text style={styles.navIcon}>{item.icon}</Text>
                            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                                {item.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* Bottom */}
            <View style={styles.bottomArea}>
                {/* Featured Affiliate — only shown when admin has toggled it visible */}
                {affVisible && (
                    <Pressable
                        onPress={affLink ? handleAffiliatePress : undefined}
                        style={[styles.affiliatePlaceholder, affLink && { borderStyle: 'solid', borderColor: '#4A90E244' }]}
                    >
                        <Text style={styles.affiliateIcon}>{affIcon}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.affiliateTitle}>{affTitle}</Text>
                            <Text style={styles.affiliateSub}>{affSub}</Text>
                        </View>
                        {affBadge ? (
                            <View style={styles.affiliateBadge}>
                                <Text style={styles.affiliateBadgeText}>{affBadge}</Text>
                            </View>
                        ) : null}
                    </Pressable>
                )}

                <View style={styles.elkBrand}>
                    <View style={styles.elkAvatar}>
                        <Text style={styles.elkAvatarText}>ELK</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.elkName}>ESSENTIAL LIFE KITS</Text>
                        <Text style={styles.elkSub}>ELK — Brand Partner</Text>
                    </View>
                </View>

                {userEmail === 'essentiallifekits@gmail.com' && (
                    <Pressable onPress={() => navigateTo('/(app)/admin')} style={styles.adminBtn}>
                        <Text style={styles.adminIcon}>🛡️</Text>
                        <Text style={styles.adminText}>Admin Portal</Text>
                    </Pressable>
                )}

                <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
                    <Text style={styles.signOutIcon}>🚪</Text>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </Pressable>
            </View>
        </>
    );
}

// ── Main Sidebar export ───────────────────────────────────────────────────────
export default function Sidebar({ visible, onClose, isDesktop = false }: SidebarProps) {
    const slideAnim = useRef(new Animated.Value(-MOBILE_SIDEBAR_W)).current;
    const overlayOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isDesktop) return;
        if (visible) {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
                Animated.timing(overlayOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: -MOBILE_SIDEBAR_W, duration: 210, useNativeDriver: true }),
                Animated.timing(overlayOpacity, { toValue: 0, duration: 210, useNativeDriver: true }),
            ]).start();
        }
    }, [visible, isDesktop]);

    // ── Desktop: static column (no overlay, no animation) ────────────────────
    if (isDesktop) {
        return (
            <View style={styles.sidebarDesktop}>
                <SidebarContent isDesktop onClose={onClose} />
            </View>
        );
    }

    // ── Mobile: animated slide-out overlay ───────────────────────────────────
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
            <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </Animated.View>
            <Animated.View style={[styles.sidebarMobile, { transform: [{ translateX: slideAnim }] }]}>
                <SidebarContent isDesktop={false} onClose={onClose} />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.65)',
        zIndex: 40,
    },

    // Desktop: participates in normal layout flow as a fixed-width column
    sidebarDesktop: {
        width: 240,
        flexDirection: 'column',
        backgroundColor: colors.bgSecondary,
        borderRightWidth: 1,
        borderRightColor: colors.border,
    },

    // Mobile: absolute overlay panel
    sidebarMobile: {
        position: 'absolute',
        top: 0, left: 0, bottom: 0,
        width: MOBILE_SIDEBAR_W,
        backgroundColor: colors.bgSecondary,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        zIndex: 50,
        flexDirection: 'column',
    },

    gradientHeader: {
        backgroundColor: NF_BLUE_DARK,
        paddingTop: 52,
        paddingHorizontal: 20,
        paddingBottom: 20,
        gap: 16,
        shadowColor: NF_BLUE,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
        elevation: 10,
        borderBottomWidth: 1,
        borderBottomColor: NF_BLUE_MID + '55',
    },
    // Desktop header: no extra top padding needed (no status bar offset)
    gradientHeaderDesktop: {
        paddingTop: 24,
    },

    logoArea: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logoText: { fontWeight: '800', fontSize: 22, color: '#fff', letterSpacing: -0.4 },

    headerUserArea: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerAvatar: {
        width: 38, height: 38, borderRadius: radius.full,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
    },
    headerAvatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
    headerUserName: { fontSize: 13, fontWeight: '700', color: '#fff' },
    headerUserPlan: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

    navArea: { flex: 1, paddingHorizontal: 12, paddingVertical: 16, gap: 4 },
    navItem: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 12, paddingHorizontal: 16,
        borderRadius: radius.md, position: 'relative',
    },
    navItemActive: { backgroundColor: NF_BLUE + '18' },
    navItemPressed: { backgroundColor: NF_BLUE + '0A' },
    navActiveBar: {
        position: 'absolute', left: 0, top: '50%',
        width: 3, height: 24, backgroundColor: NF_BLUE,
        borderTopRightRadius: 3, borderBottomRightRadius: 3, marginTop: -12,
    },
    navIcon: { fontSize: 18 },
    navLabel: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    navLabelActive: { color: NF_BLUE, fontWeight: '700' },

    bottomArea: {
        paddingHorizontal: 12,
        paddingBottom: 36,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 16,
        gap: 10,
    },

    affiliatePlaceholder: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 14, paddingHorizontal: 16,
        backgroundColor: NF_BLUE + '0F',
        borderWidth: 1, borderColor: NF_BLUE + '33',
        borderRadius: radius.md,
        borderStyle: 'dashed',
    },
    affiliateIcon: { fontSize: 20 },
    affiliateTitle: { fontWeight: '700', fontSize: 13, color: colors.textPrimary },
    affiliateSub: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
    affiliateBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: NF_BLUE + '22', borderRadius: radius.full },
    affiliateBadgeText: { fontSize: 9, fontWeight: '700', color: NF_BLUE },

    elkBrand: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 12, paddingHorizontal: 16,
        backgroundColor: colors.bgElevated,
        borderWidth: 1, borderColor: colors.border,
        borderRadius: radius.md,
    },
    elkAvatar: {
        width: 36, height: 36, borderRadius: radius.sm,
        backgroundColor: NF_BLUE,
        alignItems: 'center', justifyContent: 'center',
    },
    elkAvatarText: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
    elkName: { fontSize: 11, fontWeight: '800', color: colors.textPrimary, letterSpacing: 0.5 },
    elkSub: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },

    adminBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 11, paddingHorizontal: 16,
        backgroundColor: NF_BLUE + '12',
        borderWidth: 1, borderColor: NF_BLUE + '33',
        borderRadius: radius.md,
    },
    adminIcon: { fontSize: 16 },
    adminText: { fontSize: 13, fontWeight: '700', color: NF_BLUE },

    signOutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: colors.error + '15',
        borderWidth: 1.5,
        borderColor: colors.error + '55',
        borderRadius: radius.md,
    },
    signOutIcon: { fontSize: 18 },
    signOutText: { fontSize: 14, fontWeight: '700', color: colors.error, letterSpacing: 0.2 },
});
