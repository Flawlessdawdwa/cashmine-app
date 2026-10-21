import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useClaimOptions } from '../hooks/queries';
import { useDisplayBalances } from '../hooks/useClaims';
import { formatUnits, parseApiAmount, validateClaim, type ClaimRules } from '../lib/money';
import { submitClaim } from '../state/claimEngine';
import { Banner, Button, Card, ErrorCard, Header, Row, colors, styles } from '../components/ui';
import type { Nav } from '../navigation';

export function ClaimScreen({ nav, initialAsset }: { nav: Nav; initialAsset: string }) {
  const balances = useDisplayBalances();
  const [asset, setAsset] = useState(initialAsset);
  const [input, setInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const submitting = useRef(false);

  const options = useClaimOptions(asset);
  const row = balances.rows?.find((r) => r.asset === asset);
  const d = row?.decimals ?? 0;
  const fmt = (u: bigint) => formatUnits(u, d);

  // Cheap (two string parses), so no memo.
  let rules: ClaimRules | null = null;
  if (row && options.data) {
    try {
      rules = {
        decimals: row.decimals,
        minAmount: parseApiAmount(options.data.minAmount, row.decimals),
        fee: parseApiAmount(options.data.fee, row.decimals),
        available: row.available,
      };
    } catch {
      rules = null; // malformed API amount: rendered as "can't be claimed right now"
    }
  }

  const result = rules ? validateClaim(input, rules) : null;
  const dest = options.data?.destinations.find((x) => x.id === destinationId) ?? options.data?.destinations[0];

  const changeAsset = (a: string) => {
    setAsset(a);
    setInput('');
    setTouched(false);
    setDestinationId(null);
  };

  const confirm = () => {
    if (submitting.current || !result?.ok || !dest || !row || row.unresolved) return;
    submitting.current = true; // guards a double tap before the re-render
    const key = submitClaim({ asset, amount: formatUnits(result.amount, d), destinationId: dest.id }, d);
    nav.reset({ name: 'claimStatus', key });
  };

  if (step === 'review' && result?.ok && dest) {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <Header title="Confirm claim" onBack={() => setStep('edit')} />
        <Card>
          <Row label="Claim" value={`${fmt(result.amount)} ${asset}`} />
          <Row label="Fee" value={`− ${fmt(result.fee)} ${asset}`} />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
          <Row label="You receive" value={`${fmt(result.receive)} ${asset}`} strong />
          <Row label="To" value={dest.label} />
        </Card>
        <Text style={[styles.muted, { marginBottom: 12, lineHeight: 20 }]}>
          The amount leaves your available balance right away and usually settles within about 20 seconds.
        </Text>
        <Button title={`Confirm claim of ${fmt(result.amount)} ${asset}`} onPress={confirm} />
      </ScrollView>
    );
  }

  const claimable = balances.rows?.filter((r) => r.available > 0n) ?? [];

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Header title="Claim payback" onBack={nav.back} />

      <Text style={[styles.muted, { marginBottom: 8 }]}>Asset</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {claimable.map((r) => (
          <Pressable
            key={r.asset}
            disabled={r.unresolved}
            onPress={() => changeAsset(r.asset)}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
              borderColor: r.asset === asset ? colors.accent : colors.border,
              backgroundColor: r.asset === asset ? colors.accentSoft : 'transparent',
              opacity: r.unresolved ? 0.4 : 1,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '600' }}>{r.asset}</Text>
          </Pressable>
        ))}
      </View>

      {row?.unresolved ? <Banner tone="warn">We’re still confirming an earlier claim for this asset. Wait for it before claiming again.</Banner> : null}

      {balances.error && !balances.data ? (
        <ErrorCard
          title="Couldn’t load balances"
          error={balances.error}
          retrying={balances.isFetching}
          onRetry={() => balances.refetch()}
          onChangeToken={() => nav.go({ name: 'token' })}
        />
      ) : options.error ? (
        <ErrorCard
          title="Couldn’t load claim options"
          error={options.error}
          retrying={options.isFetching}
          onRetry={() => options.refetch()}
          onChangeToken={() => nav.go({ name: 'token' })}
        />
      ) : options.isPending || balances.isPending ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : !row || !rules ? (
        <Banner tone="danger">This asset can’t be claimed right now.</Banner>
      ) : (
        <>
          <Card>
            <View style={[styles.row, { marginBottom: 8 }]}>
              <Text style={styles.muted}>Amount</Text>
              <Text style={styles.muted}>Available {fmt(row.available)} {asset}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                value={input}
                onChangeText={(t) => {
                  setInput(t);
                  setTouched(true);
                }}
                placeholder="0"
                placeholderTextColor={colors.muted}
                inputMode="decimal"
                keyboardType="decimal-pad"
                autoFocus
                style={[styles.input, { flex: 1 }]}
              />
              <Button
                small
                variant="secondary"
                title="Max"
                onPress={() => {
                  setInput(fmt(row.available));
                  setTouched(true);
                }}
              />
            </View>
            {touched && result && !result.ok ? <Text style={styles.error}>{result.error}</Text> : null}
            <Text style={[styles.muted, { marginTop: 8 }]}>Minimum {fmt(rules.minAmount)} {asset}</Text>
          </Card>

          <Card>
            <Row label="Fee" value={`${fmt(rules.fee)} ${asset}`} />
            <Row label="You receive" value={result?.ok ? `${fmt(result.receive)} ${asset}` : '—'} strong />
          </Card>

          {options.data && options.data.destinations.length > 1 ? (
            <Card>
              <Text style={[styles.muted, { marginBottom: 8 }]}>Send to</Text>
              {options.data.destinations.map((x) => (
                <Pressable key={x.id} onPress={() => setDestinationId(x.id)} style={{ paddingVertical: 8 }}>
                  <Text style={{ color: x.id === dest?.id ? colors.accent : colors.text }}>{x.id === dest?.id ? '● ' : '○ '}{x.label}</Text>
                </Pressable>
              ))}
            </Card>
          ) : dest ? (
            <Text style={[styles.muted, { marginBottom: 12 }]}>Sent to {dest.label}</Text>
          ) : (
            <Banner tone="danger">No destination available for this asset.</Banner>
          )}

          <Button title="Review" disabled={!result?.ok || !dest || row.unresolved} onPress={() => setStep('review')} />
        </>
      )}
    </ScrollView>
  );
}
