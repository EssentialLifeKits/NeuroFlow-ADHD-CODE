/**
 * StickerTray — emoji sticker picker for task rewards.
 * Horizontal scrollable row; tap a sticker to select / deselect.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

export const STICKERS = [
  '⭐', '🔥', '💪', '🌟', '🎯', '🏆', '💎', '🌈', '🎉',
  '🦋', '🌸', '🍀', '🧠', '💡', '🚀', '🌺', '🎵', '🎨',
  '✨', '🌙', '🦄', '🐢', '🍉', '🧩', '🎀',
];

interface Props {
  selected: string | null;
  onSelect: (sticker: string | null) => void;
}

export function StickerTray({ selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {/* "None" option */}
      <TouchableOpacity
        onPress={() => onSelect(null)}
        style={[styles.btn, !selected && styles.btnSelected]}
        activeOpacity={0.7}
      >
        <Text style={[styles.none, !selected && { color: colors.textSecondary }]}>∅</Text>
      </TouchableOpacity>

      {STICKERS.map((s) => (
        <TouchableOpacity
          key={s}
          onPress={() => onSelect(selected === s ? null : s)}
          style={[styles.btn, selected === s && styles.btnSelected]}
          activeOpacity={0.7}
        >
          <Text style={styles.sticker}>{s}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  btnSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  sticker: { fontSize: 22 },
  none: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
