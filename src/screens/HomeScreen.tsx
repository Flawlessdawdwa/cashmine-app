import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useDisplayBalances } from '../hooks/useClaims';
import { ApiError } from '../lib/api';
import { formatUnits, formatUsd, usdValue } from '../lib/money';
import type { DisplayBalance } from '../lib/overlay';
import { isPending, isUnresolved, useClaimsStore } from '../state/claimsStore';
import { Banner, Button, Card, Row, colors, styles } from '../components/ui';
import type { Nav } from '../navigation';

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function HomeScreen({ nav }: { nav: Nav }) {
  const q = useDisplayBalances();
  const attempts = useClaimsStore((s) => s.attempts);
  const now = useNow();
  const active = attempts.filter((a) => isUnresolved(a) || isPending(a) || a.state === 'rejected' || a.state === 'created');

  const authError = q.error instanceof ApiError && q.error.status === 401;
  const ageMs = q.data ? now - Date.parse(q.data.asOf) : 0;
  const stale = ageMs > 60_000;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.accent} />}
    >
      <View style={[styles.header, { paddingTop: 16 }]}>
        <Text style={[styles.headerTitle, { fontSize: 20 }]}>Payback</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small variant="ghost" title="Activity" onPress={() => nav.go({ name: 'activity' })} />
          <Button small variant="ghost" title="Token" onPress={() => nav.go({ name: 'token' })} />
        </View>
      </View>

      {q.isPending && !q.error ? (
        <View style={{ paddingVertical: 80, alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.muted, { marginTop: 12 }]}>Loading balances…</Text>
        </View>
      ) : null}

      {authError ? (
        <Banner tone="danger">
          <Text style={[styles.bannerText, { color: colors.danger, marginBottom: 8 }]}>Your token is invalid or expired.</Text>
          <Button small title="Change token" onPress={() => nav.go({ name: 'token' })} />
        </Banner>
      ) : q.error && !q.data ? (
        <Card>
          <Text style={[styles.h2, { marginBottom: 6 }]}>Couldn't load balances</Text>
          <Text style={[styles.muted, { marginBottom: 12 }]}>{q.error.message}</Text>
          <Button title="Try again" loading={q.isFetching} onPress={() => q.refetch()} />
        </Card>
      ) : q.error ? (
        <Banner tone="warn">{`Couldn't refresh (${q.error.message}). Showing data from ${ago(ageMs)}.`}</Banner>
      ) : null}

      {q.dataError ? <Banner tone="danger">{`Received unexpected data from the server. ${q.dataError.message}`}</Banner> : null}

      {q.rows && q.totals ? (
        <>
          <Card>
            <Text style={styles.muted}>Available to claim</Text>
            <Text style={styles.h1}>{formatUsd(q.totals.available)}</Text>
            <Text style={[styles.muted, { marginTop: 4 }]}>Total incl. pending & claiming: {formatUsd(q.totals.total)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <Text style={[styles.muted, stale && { color: colors.warn }]}>
                {stale ? '⚠ ' : ''}Updated {ago(ageMs)}{q.isFetching ? ' · refreshing…' : ''}
              </Text>
              <Button small variant="secondary" title="Refresh" loading={q.isFetching} onPress={() => q.refetch()} />
            </View>
          </Card>

          {active.length > 0 ? (
            <Card>
              <Text style={[styles.h2, { marginBottom: 8 }]}>Your claims</Text>
              {active.map((a) => (
                <Pressable key={a.key} onPress={() => nav.go({ name: 'claimStatus', key: a.key })} style={{ paddingVertical: 8 }}>
                  <View style={styles.row}>
                    <Text style={styles.text}>{a.body.amount} {a.body.asset}</Text>
                    <Text style={{ color: statusColor(a.state, a.claim?.status), fontWeight: '600' }}>{statusLabel(a.state, a.claim?.status)} ›</Text>
                  </View>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {q.rows.length === 0 ? <Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>No payback yet.</Text> : null}
          {q.rows.map((r) => (
            <AssetCard key={r.asset} row={r} onClaim={() => nav.go({ name: 'claim', asset: r.asset })} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function AssetCard({ row, onClaim }: { row: DisplayBalance; onClaim: () => void }) {
  const f = (u: bigint) => formatUnits(u, row.decimals);
  return (
    <Card>
      <View style={[styles.row, { marginBottom: 4 }]}>
        <Text style={styles.h2}>{row.asset}</Text>
        <Text style={styles.muted}>{formatUsd(usdValue(row.available, row.decimals, row.usdPrice))} available</Text>
      </View>
      <Row label="Available" value={f(row.available)} strong />
      <Row label="Pending" value={f(row.pending)} />
      <Row label="Claiming" value={f(row.claiming)} />
      {row.adjusted ? <Text style={[styles.muted, { color: colors.warn, marginTop: 4 }]}>Includes your claim just submitted</Text> : null}
      {row.unresolved ? <Text style={[styles.muted, { color: colors.warn, marginTop: 4 }]}>Checking a claim for this asset…</Text> : null}
      <View style={{ height: 10 }} />
      <Button small title={row.unresolved ? 'Claim in progress' : 'Claim'} disabled={row.available <= 0n || row.unresolved} onPress={onClaim} />
    </Card>
  );
}

export function statusLabel(state: string, status?: string) {
  if (state === 'submitting') return 'Submitting';
  if (state === 'unknown') return 'Checking';
  if (state === 'rejected') return 'Not submitted';
  if (status === 'pending') return 'Processing';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  return state;
}

export function statusColor(state: string, status?: string) {
  if (state === 'rejected' || status === 'failed') return colors.danger;
  if (status === 'completed') return colors.accent;
  return colors.warn;
}
