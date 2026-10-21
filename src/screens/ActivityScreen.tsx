import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useActivity } from '../hooks/queries';
import type { ActivityItem } from '../lib/api';
import { Banner, Button, ErrorCard, Header, colors, styles } from '../components/ui';
import type { Nav } from '../navigation';

const TYPE_LABEL = { accrual: 'Payback', reversal: 'Reversal', claim: 'Claim' } as const;

export function ActivityScreen({ nav }: { nav: Nav }) {
  const q = useActivity();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1 }}>
      <Header title="Activity" onBack={nav.back} />
      {q.isPending ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : q.error && !q.data ? (
        <ErrorCard
          title="Couldn’t load activity"
          error={q.error}
          retrying={q.isFetching}
          onRetry={() => q.refetch()}
          onChangeToken={() => nav.go({ name: 'token' })}
        />
      ) : (
        <FlatList
          showsVerticalScrollIndicator={false}
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <ActivityRow item={item} />}
          onRefresh={() => { q.refetch(); }}
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          ListHeaderComponent={
            q.isRefetchError ? <Banner tone="warn">{`Couldn’t refresh (${q.error?.message}). Showing earlier results.`}</Banner> : undefined
          }
          ListEmptyComponent={<Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>No activity yet.</Text>}
          ListFooterComponent={
            <View style={{ paddingVertical: 16 }}>
              {q.isFetchNextPageError ? <Text style={[styles.error, { marginBottom: 8 }]}>Couldn’t load more.</Text> : null}
              {q.hasNextPage ? (
                <Button title="Load more" variant="secondary" loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()} />
              ) : items.length > 0 ? (
                <Text style={[styles.muted, { textAlign: 'center' }]}>That’s everything.</Text>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const negative = item.amount.startsWith('-');
  const sub = [item.exchange, new Date(item.createdAt).toLocaleString()].filter(Boolean).join(' · ');
  const statusColor = item.status === 'failed' ? colors.danger : item.status === 'pending' ? colors.warn : colors.muted;
  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={styles.row}>
        <Text style={[styles.text, { fontWeight: '600' }]}>{TYPE_LABEL[item.type] ?? item.type}</Text>
        <Text style={[styles.value, { color: item.status === 'failed' ? colors.muted : negative ? colors.text : colors.accent, textDecorationLine: item.status === 'failed' ? 'line-through' : 'none' }]}>
          {negative ? '' : '+'}{item.amount} {item.asset}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.muted}>{sub}</Text>
        <Text style={{ color: statusColor, fontSize: 13 }}>{item.status}</Text>
      </View>
    </View>
  );
}
