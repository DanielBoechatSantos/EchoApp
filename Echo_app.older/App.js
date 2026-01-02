import React, { useState, useEffect, useRef } from "react";
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity,
  FlatList, Alert, Switch, StyleSheet, ActivityIndicator,
  ScrollView, Platform, Modal, StatusBar
} from "react-native";
import axios from "axios";
import io from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { CameraView, useCameraPermissions } from 'expo-camera';

const DEFAULT_SERVER_IP = "192.168.10.8";

export default function App() {
  const [screen, setScreen] = useState("login");
  const [serverIp, setServerIp] = useState(DEFAULT_SERVER_IP);
  const [ipInput, setIpInput] = useState(DEFAULT_SERVER_IP);
  const [showIpScreen, setShowIpScreen] = useState(false);
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userLevel, setUserLevel] = useState(null);
  const [isMusician, setIsMusician] = useState(false);
  
  const [songs, setSongs] = useState([]);
  const [filteredSongs, setFilteredSongs] = useState([]);
  const [selectedSong, setSelectedSong] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [isRouter, setIsRouter] = useState(false);
  const [routerUser, setRouterUser] = useState(null);
  const [searchText, setSearchText] = useState("");
  
  const [permission, requestPermission] = useCameraPermissions();
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanned, setScanned] = useState(false);

  const socketRef = useRef(null);
  const SERVER_URL = serverIp.startsWith('http') ? serverIp : `http://${serverIp}:5000`;

  useEffect(() => {
    const loadSavedIp = async () => {
      const savedIp = await AsyncStorage.getItem("server_ip");
      if (savedIp) { setServerIp(savedIp); setIpInput(savedIp); }
    };
    loadSavedIp();
  }, []);

  useEffect(() => {
    if (screen === "main") {
      setupSocket(username);
      fetchSongs();
    }
  }, [screen]);

  const setupSocket = (currentUser) => {
    if (socketRef.current) socketRef.current.disconnect();
    const socket = io(SERVER_URL, { transports: ["websocket"] });

    socket.on("connect", () => {
      if (currentUser) socket.emit("identify", { username: currentUser });
    });

    socket.on("router_claimed", (data) => setRouterUser(data.router_user));
    socket.on("open_song", async (data) => {
      try {
        const res = await axios.get(`${SERVER_URL}/api/song/${data.song_id}`);
        setSelectedSong(res.data);
        setScreen("song");
      } catch (err) { console.warn("Erro socket open_song", err); }
    });

    socketRef.current = socket;
  };

  const handleBarCodeScanned = async ({ data }) => {
    setScanned(true);
    setScanModalVisible(false);
    if (data.startsWith('http')) {
      setServerIp(data);
      setIpInput(data);
      await AsyncStorage.setItem("server_ip", data);
      Alert.alert("Sucesso", "Servidor Echo conectado!");
    }
  };

  async function doLogin() {
    setLoading(true);
    try {
      const res = await axios.post(`${SERVER_URL}/api/login`, { username, password });
      setUserLevel(res.data.nivel);
      setScreen("main");
    } catch (err) {
      Alert.alert("Erro", "Falha na conexão ou credenciais.");
    } finally { setLoading(false); }
  }

  async function fetchSongs() {
    try {
      const res = await axios.get(`${SERVER_URL}/api/songs`);
      setSongs(res.data);
      setFilteredSongs(res.data);
    } catch (err) { console.error(err); }
  }

  function openSongLocal(song) {
    setSelectedSong(song);
    setScreen("song");
    if (isRouter && socketRef.current?.connected) {
      socketRef.current.emit("open_song", { song_id: song.id, user: username });
    }
  }

  function toggleRouter(shouldClaim) {
    setIsRouter(shouldClaim);
    socketRef.current.emit(shouldClaim ? "claim_router" : "release_router", { user: username });
  }

  // --- RENDERS ---
  if (showIpScreen) return (
    <SafeAreaView style={styles.container}>
      <View style={styles.contentWrapper}>
        <View style={styles.card}>
          <Text style={styles.title2}>Configurar IP</Text>
          <TextInput style={styles.input} value={ipInput} onChangeText={setIpInput} />
          <TouchableOpacity style={styles.modernButton} onPress={() => {setServerIp(ipInput); setShowIpScreen(false);}}>
            <Text style={styles.buttonText}>Salvar Manual</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modernButton, {backgroundColor: '#007bff', marginTop: 10}]} onPress={async () => {
            const { granted } = await requestPermission();
            if(granted) { setScanned(false); setScanModalVisible(true); }
          }}>
            <Text style={styles.buttonText}>Escanear QR Code</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Modal visible={scanModalVisible}>
        <CameraView style={StyleSheet.absoluteFill} onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} />
        <TouchableOpacity style={styles.closeButton} onPress={()=>setScanModalVisible(false)}><Text style={{color:'#fff'}}>Fechar</Text></TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );

  if (screen === "login") return (
    <SafeAreaView style={styles.container}>
      <View style={styles.contentWrapper}>
        <TouchableOpacity style={styles.settingsButton} onPress={() => setShowIpScreen(true)}>
          <Text style={{fontSize: 24}}>⚙️</Text>
        </TouchableOpacity>
        <Text style={styles.title2}>Echo - Login</Text>
        <TextInput style={styles.input} placeholder="Usuário" value={username} onChangeText={setUsername} />
        <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword} />
        <TouchableOpacity style={styles.modernButton} onPress={doLogin}>
          <Text style={styles.buttonText}>Entrar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  if (screen === "main") return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContentWrapper}>
        <TextInput style={styles.searchInput} placeholder="Buscar..." value={searchText} onChangeText={(t)=>{setSearchText(t); setFilteredSongs(songs.filter(s => s.titulo.toLowerCase().includes(t.toLowerCase())));}} />
        <FlatList
          data={filteredSongs}
          renderItem={({item}) => (
            <TouchableOpacity style={styles.songCard} onPress={()=>openSongLocal(item)}>
              <Text style={styles.songTitle}>{item.titulo} - {item.banda}</Text>
            </TouchableOpacity>
          )}
        />
        <View style={styles.bottomRow}>
          <Text style={{color:'#fff'}}>Modo Músico (Cifras)</Text>
          <Switch value={isMusician} onValueChange={setIsMusician} />
          {userLevel === "Router" && (
            <TouchableOpacity onPress={()=>toggleRouter(!isRouter)} style={{backgroundColor:'#1f6feb', padding:8, borderRadius:5}}>
              <Text style={{color:'#fff'}}>{isRouter ? "Liberar" : "Router"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );

  if (screen === "song") return (
    <SafeAreaView style={styles.container}>
        <View style={styles.mainContentWrapper}>
          <Text style={styles.title}>{selectedSong?.titulo}</Text>
          <ScrollView><Text style={{color:'#fff', fontSize: 18, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'}}>
            {isMusician ? selectedSong?.cifra : selectedSong?.letra}
          </Text></ScrollView>
          <TouchableOpacity style={styles.modernButton} onPress={()=>setScreen("main")}>
            <Text style={styles.buttonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d1b2a" },
  contentWrapper: { flex: 1, justifyContent: "center", padding: 20 },
  mainContentWrapper: { flex: 1, padding: 20 },
  card: { backgroundColor: "#fff", padding: 20, borderRadius: 20 },
  input: { backgroundColor: "#eee", borderRadius: 10, padding: 10, marginBottom: 10 },
  searchInput: { backgroundColor: "#1b2a3a", color: "#fff", borderRadius: 10, padding: 10, marginBottom: 10 },
  modernButton: { backgroundColor: "#1f6feb", padding: 15, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "bold" },
  settingsButton: { position: "absolute", top: 40, right: 20 },
  songCard: { backgroundColor: "#1b2a3a", padding: 15, borderRadius: 10, marginBottom: 10 },
  songTitle: { color: "#fff" },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  title: { color: "#fff", fontSize: 24, textAlign: "center", marginBottom: 10 },
  title2: { fontSize: 22, textAlign: "center", marginBottom: 20 },
  closeButton: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'red', padding: 10, borderRadius: 10 }
});