import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useChangeToken } from '../hooks/useClaims';
import { useAuthStore } from '../state/authStore';
import { Button, Card, Header, colors, styles } from '../components/ui';

export function TokenScreen({ onDone }: { onDone?: () => void }) {
  const token = useAuthStore((s) => s.token);
  const setToken = useChangeToken();
  const [value, setValue] = useState('');
  return (
    <View>
      <Header title="API token" onBack={token ? onDone : undefined} />
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
          disabled={!value.trim()}
          onPress={() => {
            setToken(value);
            onDone?.();
          }}
        />
        {token ? (
          <>
            <View style={{ height: 8 }} />
            <Text style={[styles.muted, { marginBottom: 8 }]}>Current token ends in …{token.slice(-6)}</Text>
            <Button title="Remove token" variant="ghost" onPress={() => setToken(null)} />
          </>
        ) : null}
      </Card>
    </View>
  );
}
