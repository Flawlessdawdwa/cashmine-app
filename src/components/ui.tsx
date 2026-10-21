import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#0E1116',
  card: '#171B22',
  border: '#262C36',
  text: '#F2F4F7',
  muted: '#8A94A6',
  accent: '#3DDC97',
  accentSoft: '#3DDC9722',
  accentText: '#062417',
  warn: '#F5B14C',
  danger: '#FF6B6B',
};

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title, onPress, disabled, loading, variant = 'primary', small,
}: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'secondary' | 'ghost'; small?: boolean }) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'ghost' && styles.btnGhost,
        off && styles.btnDisabled,
        pressed && !off && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.accentText : colors.text} />
      ) : (
        <Text style={[styles.btnText, small && { fontSize: 14 }, variant === 'primary' ? { color: colors.accentText } : { color: colors.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Banner({ tone, children }: { tone: 'warn' | 'danger' | 'info'; children: ReactNode }) {
  const c = tone === 'danger' ? colors.danger : tone === 'warn' ? colors.warn : colors.accent;
  return (
    <View style={[styles.banner, { borderColor: c }]}>
      {typeof children === 'string' ? <Text style={[styles.bannerText, { color: c }]}>{children}</Text> : children}
    </View>
  );
}

/** Load error: a 401 can only be fixed with a new token, anything else gets a retry. */
export function ErrorCard({ title, error, onRetry, retrying, onChangeToken }: {
  title: string; error: Error; onRetry: () => void; retrying: boolean; onChangeToken: () => void;
}) {
  const unauthorized = (error as { status?: number }).status === 401;
  return (
    <Card>
      <Text style={[styles.h2, { marginBottom: 6 }]}>{unauthorized ? 'Your token is invalid or expired' : title}</Text>
      {unauthorized ? null : <Text style={[styles.muted, { marginBottom: 12 }]}>{error.message}</Text>}
      {unauthorized ? (
        <Button title="Change token" onPress={onChangeToken} />
      ) : (
        <Button title="Try again" loading={retrying} onPress={onRetry} />
      )}
    </Card>
  );
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.value, strong && { fontWeight: '700', fontSize: 17 }]} selectable>{value}</Text>
    </View>
  );
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
      ) : <View />}
      <Text style={styles.headerTitle}>{title}</Text>
      {right ?? <View style={{ width: 50 }} />}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  btn: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSmall: { minHeight: 36, borderRadius: 10, paddingHorizontal: 12 },
  btnPrimary: { backgroundColor: colors.accent },
  btnSecondary: { backgroundColor: colors.border },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 16, fontWeight: '600' },
  banner: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  bannerText: { fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, gap: 12 },
  muted: { color: colors.muted, fontSize: 14 },
  value: { color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' },
  text: { color: colors.text, fontSize: 15 },
  h1: { color: colors.text, fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  h2: { color: colors.text, fontSize: 18, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  back: { color: colors.accent, fontSize: 16, width: 50 },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text,
    fontSize: 22, paddingHorizontal: 14, paddingVertical: 12, fontVariant: ['tabular-nums'],
  },
  error: { color: colors.danger, fontSize: 14, marginTop: 6 },
});
