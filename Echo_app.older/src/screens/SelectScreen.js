import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, Switch
} from 'react-native';
import axios from 'axios';
import io from 'socket.io-client';
import { useApp } from '../store/appStore';

const SERVER_URL = 'http://192.168.10.8:5000'; // ajuste se necessário
const SOCKET_PATH = '/socket.io/'; // só se seu servidor usar caminho custom

export default function SelectScreen({ navigation }) {
  const { auth, role, setRole, isRouter, setIsRouter, setCurrentSong } = useApp();

  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    fetchSongs();

    // conectar socket
    const socket = io(SERVER_URL, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('socket connected', socket.id);
      setSocketConnected(true);
      // registrar usuário (opcional) - informa servidor quem é
      socket.emit('register_client', { user: auth.user });
    });

    socket.on('disconnect', () => {
      console.log('socket disconnected');
      setSocketConnected(false);
    });

    // evento recebido quando router manda tocar/abrir uma música
    socket.on('play_song', (payload) => {
      // payload: { songId }
      console.log('recebeu play_song', payload);
      const song = songs.find(s => s.id === payload.songId) || null;
      if (song) {
        // abre a tela da música com o conteúdo apropriado
        setCurrentSong(song);
        navigation.navigate('SongView', { fromSync: true });
      } else {
        // se ainda não tem a lista carregada, podemos buscar o song pelo id
        fetchSongById(payload.songId).then(s => {
          if (s) {
            setCurrentSong(s);
            navigation.navigate('SongView', { fromSync: true });
          }
        }).catch(() => {});
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // eslint-disable-line

  async function fetchSongs() {
    try {
      setLoading(true);
      const res = await axios.get(`${SERVER_URL}/songs`);
      // espera array [{id, title, letra, cifra}]
      setSongs(res.data || []);
    } catch (err) {
      console.error('fetchSongs err', err.message);
      Alert.alert('Erro', 'Não foi possível obter a lista de músicas do servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchSongById(id) {
    try {
      const res = await axios.get(`${SERVER_URL}/songs/${id}`);
      return res.data;
    } catch (err) {
      console.warn('fetchSongById failed', err.message);
      return null;
    }
  }

  function onPressSong(song) {
    // se este cliente estiver como router => emite evento para o servidor
    if (isRouter) {
      // envia para servidor: todos os clientes conectados receberão 'play_song'
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('play_song', { songId: song.id });
        // também abre localmente
        setCurrentSong(song);
        navigation.navigate('SongView', { fromSync: true });
      } else {
        Alert.alert('Socket', 'Não conectado ao servidor (router).');
      }
    } else {
      // abre localmente só para este aparelho
      setCurrentSong(song);
      navigation.navigate('SongView', { fromSync: false });
    }
  }

  function renderItem({ item }) {
    return (
      <TouchableOpacity style={styles.songRow} onPress={() => onPressSong(item)}>
        <Text style={styles.songTitle}>{item.title}</Text>
        <Text style={styles.songMeta}>{item.id}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>Olá, {auth.user}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Sou músico</Text>
          <Switch
            value={role === 'musico'}
            onValueChange={(v) => setRole(v ? 'musico' : 'nao_musico')}
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Router</Text>
          <Switch
            value={isRouter}
            onValueChange={(v) => {
              setIsRouter(v);
              // opcional: notificar servidor que este cliente é router (para permissões)
              if (socketRef.current && socketRef.current.connected) {
                socketRef.current.emit('set_router', { isRouter: v, user: auth.user });
              }
            }}
          />
        </View>

        <View style={styles.socketStatusRow}>
          <Text style={styles.small}>{socketConnected ? 'Conectado ao servidor' : 'Desconectado'}</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchSongs}>
            <Text style={styles.refreshText}>Atualizar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.listWrap}>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          <FlatList
            data={songs}
            keyExtractor={(i) => String(i.id)}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#f7f7f7' },
  header: { paddingBottom: 8 },
  welcome: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 },
  label: { fontSize: 16 },
  small: { fontSize: 12, color: '#666' },
  refreshBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1f6feb', borderRadius: 6 },
  refreshText: { color: '#fff', fontWeight: '700' },
  listWrap: { flex: 1, marginTop: 8 },
  songRow: { padding: 12, backgroundColor: '#fff', borderRadius: 8, marginVertical: 6 },
  songTitle: { fontSize: 16, fontWeight: '600' },
  songMeta: { fontSize: 12, color: '#888', marginTop: 4 },
});
