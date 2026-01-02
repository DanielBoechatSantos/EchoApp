// src/screens/LoginScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, Switch
} from 'react-native';
import { useApp } from '../store/appStore';

const USER_TEST = 'admin';
const PASS_TEST = '1234';

export default function LoginScreen({ navigation }) {
  const { setAuth } = useApp();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [isMusician, setIsMusician] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    if (!user.trim() || !pass.trim()) {
      Alert.alert('Atenção', 'Preencha usuário e senha.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (user.trim() === USER_TEST && pass.trim() === PASS_TEST) {
        setAuth({ logged: true, user: user.trim(), isMusician });
        navigation.replace('Home');
      } else {
        Alert.alert('Falha no logon', 'Credenciais inválidas.');
      }
    }, 300);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title, color:"white"}>Bem Vindo ao Cifrando</Text>

        <Text style={styles.label}>Usuário</Text>
        <TextInput
          style={styles.input}
          value={user}
          onChangeText={setUser}
          placeholder="Usuário"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Senha</Text>
        <TextInput
          style={styles.input}
          value={pass}
          onChangeText={setPass}
          placeholder="Senha"
          secureTextEntry
        />

        <View style={styles.switchRow}>
          <Text style={{ fontSize: 14 }}>Músico?</Text>
          <Switch value={isMusician} onValueChange={setIsMusician} />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0d1b2a' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, elevation: 3 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 14, marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, height: 44,
  },
  button: {
    marginTop: 16, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1f6feb',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
});
