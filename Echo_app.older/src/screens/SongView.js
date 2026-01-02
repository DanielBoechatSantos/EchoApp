import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity
} from 'react-native';
import axios from 'axios';
import { useApp } from '../store/appStore';

const SERVER_URL = 'http://192.168.10.8:5000';

export default function SongView({ navigation, route }) {
  const { currentSong, role } = useApp();
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);

  const showCifra = role === 'musico';

  useEffect(() => {
    if (!currentSong) {
      Alert.alert('Erro', 'Nenhuma música selecionada.');
      navigation.goBack();
      return;
    }
    loadContent();
  }, [currentSong]); // eslint-disable-line

  async function loadContent() {
    setLoading(true);
    try {
      // currentSong may contain cifra/letra strings or urls
      const text = await resolveContent(currentSong, showCifra ? 'cifra' : 'letra');
      setContent(text);
    } catch (err) {
      console.error('loadContent', err.message);
      Alert.alert('Erro', 'Não foi possível carregar o conteúdo da música.');
    } finally {
      setLoading(false);
    }
  }

  async function resolveContent(song, field) {
    const value = song[field];
    if (!value) return `Sem ${field} disponível para essa música.`;

    // heurística: se value parece ser uma URL => buscar via GET
    const isUrl = String(value).startsWith('http://') || String(value).startsWith('https://');
    if (isUrl) {
      const res = await axios.get(value);
      // assume plain text response
      if (typeof res.data === 'string') return res.data;
      // se veio JSON contendo text
      if (res.data.text) return res.data.text;
      return JSON.stringify(res.data);
    } else {
      // já é texto
      return String(value);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{currentSong ? currentSong.title : ''}</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>Fechar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {loading ? <ActivityIndicator size="large" /> : (
          <ScrollView contentContainerStyle={{ padding: 12 }}>
            <Text style={styles.contentText}>{content}</Text>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 8 },
  closeText: { color: '#1f6feb', fontWeight: '700' },
  content: { flex: 1 },
  contentText: { fontSize: 16, lineHeight: 24, fontFamily: undefined }
});
