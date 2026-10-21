import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useChangeToken } from '../hooks/useClaims';
import { useAuthStore } from '../state/authStore';
import { Banner, Button, Card, Header, colors, styles } from '../components/ui';

export function TokenScreen({ onDone }: { onDone?: () => void }) {
  const token = useAuthStore((s) => s.token);
  const { change: setToken, blocked } = useChangeToken();
  const [value, setValue] = useState('');
  return (
    <View>
      <View style={{ height: 16 }} />
      <Header title="API token" onBack={token ? onDone : undefined} />
      {token && blocked ? (
        <Banner tone="warn">We’re still confirming a claim. Wait a few seconds before changing or removing the token.</Banner>
      ) : null}
      <Card>
        <Text style={[styles.text, { marginBottom: 12, lineHeight: 21 }]}>
          Paste your CashMine API token. It is stored only in this browser.
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="ct1.…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={[styles.input, { fontSize: 15 }]}
        />
        <View style={{ height: 12 }} />
        <Button
          title="Save token"
          disabled={!value.trim() || (!!token && blocked)}
          onPress={() => {
            if (setToken(value)) onDone?.();
          }}
        />
        {token ? (
          <>
            <View style={{ height: 8 }} />
            <Text style={[styles.muted, { marginBottom: 8 }]}>Current token ends in …{token.slice(-6)}</Text>
            <Button title="Remove token" variant="ghost" disabled={blocked} onPress={() => setToken(null)} />
          </>
        ) : null}
      </Card>
    </View>
  );
}
