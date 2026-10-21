import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { runAttempt } from '../state/claimEngine';
import { useClaimsStore } from '../state/claimsStore';
import { Banner, Button, Card, Header, Row, colors, styles } from '../components/ui';
import type { Nav } from '../navigation';

export function ClaimStatusScreen({ nav, attemptKey }: { nav: Nav; attemptKey: string }) {
  const a = useClaimsStore((s) => s.attempts.find((x) => x.key === attemptKey));
  const removeAttempt = useClaimsStore((s) => s.removeAttempt);

  if (!a) {
    return (
      <View>
        <Header title="Claim" onBack={() => nav.reset({ name: 'home' })} />
        <Text style={styles.muted}>This claim is no longer tracked here. See Activity for its history.</Text>
      </View>
    );
  }

  const c = a.claim;
  const status = c?.status;

  return (
    <ScrollView>
      <Header title="Claim status" onBack={() => nav.reset({ name: 'home' })} />

      <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
        {a.state === 'submitting' || a.state === 'unknown' || status === 'pending' ? <ActivityIndicator color={colors.accent} size="large" /> : null}
        <Text style={[styles.h2, { marginTop: 12, textAlign: 'center' }]}>
          {a.state === 'submitting' && 'Submitting your claim…'}
          {a.state === 'unknown' && "We couldn't confirm your claim yet"}
          {a.state === 'rejected' && 'Claim not submitted'}
          {status === 'pending' && 'Processing'}
          {status === 'completed' && '✓ Claim completed'}
          {status === 'failed' && 'Claim failed'}
        </Text>
        <Text style={[styles.muted, { marginTop: 8, textAlign: 'center', lineHeight: 20 }]}>
          {a.state === 'unknown' &&
            `The connection dropped or the server timed out (${a.error}). Your claim may or may not have gone through. We keep checking automatically using the same request, so it can't be submitted twice. Don't claim this again.`}
          {a.state === 'rejected' && `Nothing was claimed. ${a.error ?? ''}`}
          {status === 'pending' && 'Usually settles within about 20 seconds. You can leave this screen.'}
          {status === 'completed' && `${c?.receiveAmount} ${c?.asset} is on its way to your wallet.`}
          {status === 'failed' && `${c?.failureReason ?? 'Unknown reason'}. The amount has returned to your available balance.`}
        </Text>
      </Card>

      <Card>
        <Row label="Amount" value={`${c?.amount ?? a.body.amount} ${a.body.asset}`} />
        {c ? <Row label="Fee" value={`${c.fee} ${c.asset}`} /> : null}
        {c ? <Row label={status === 'completed' ? 'Received' : 'You receive'} value={`${c.receiveAmount} ${c.asset}`} strong /> : null}
        {c ? <Row label="Claim ID" value={c.id} /> : null}
      </Card>

      {a.state === 'unknown' ? (
        <>
          <Button title="Check now" variant="secondary" onPress={() => runAttempt(a.key)} />
          <View style={{ height: 8 }} />
        </>
      ) : null}
      {a.state === 'rejected' ? (
        <>
          <Button title="Try a different amount" onPress={() => { removeAttempt(a.key); nav.reset({ name: 'claim', asset: a.body.asset }); }} />
          <View style={{ height: 8 }} />
        </>
      ) : null}
      {status === 'failed' ? <Banner tone="danger">The failed amount is back in Available. You can claim it again from Home.</Banner> : null}
      <Button title="Back to balances" variant="ghost" onPress={() => nav.reset({ name: 'home' })} />
    </ScrollView>
  );
}
