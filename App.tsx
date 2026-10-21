import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View } from 'react-native';
import { colors } from './src/components/ui';
import { queryClient } from './src/hooks/queries';
import { usePendingClaimIds, usePruneSettledClaims, useWatchClaim } from './src/hooks/useClaims';
import type { Nav, Route } from './src/navigation';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { ClaimScreen } from './src/screens/ClaimScreen';
import { ClaimStatusScreen } from './src/screens/ClaimStatusScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { TokenScreen } from './src/screens/TokenScreen';
import { useAuthStore } from './src/state/authStore';
import { resumeUnresolvedAttempts } from './src/state/claimEngine';

function ClaimWatcher({ id }: { id: string }) {
  useWatchClaim(id);
  return null;
}

/** Keeps pending claims polling and unresolved ones resending, whatever screen is open. */
function BackgroundClaims() {
  const ids = usePendingClaimIds();
  usePruneSettledClaims();
  useEffect(() => resumeUnresolvedAttempts(), []);
  return ids.map((id) => <ClaimWatcher key={id} id={id} />);
}

function Screens() {
  const token = useAuthStore((s) => s.token);
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const nav = useMemo<Nav>(
    () => ({
      go: (r) => setStack((s) => [...s, r]),
      back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      reset: (r) => setStack(r.name === 'home' ? [r] : [{ name: 'home' }, r]),
    }),
    [],
  );

  if (!token) return <TokenScreen onDone={() => nav.reset({ name: 'home' })} />;

  const route = stack[stack.length - 1];
  switch (route.name) {
    case 'home':
      return <HomeScreen nav={nav} />;
    case 'token':
      return <TokenScreen onDone={() => nav.reset({ name: 'home' })} />;
    case 'activity':
      return <ActivityScreen nav={nav} />;
    case 'claim':
      return <ClaimScreen key={route.asset} nav={nav} initialAsset={route.asset} />;
    case 'claimStatus':
      return <ClaimStatusScreen nav={nav} attemptKey={route.key} />;
  }
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 16 }}>
          {token ? <BackgroundClaims key={token} /> : null}
          <Screens />
        </View>
      </SafeAreaView>
      <StatusBar style="light" />
    </QueryClientProvider>
  );
}
