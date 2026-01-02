import React, { useState, useEffect, useRef } from "react";
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity,
  FlatList, Alert, Switch, StyleSheet, ActivityIndicator,
  ScrollView, Platform, Modal, StatusBar, KeyboardAvoidingView
} from "react-native";
import axios from "axios";
import io from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from 'expo-camera';

// Altura aproximada da StatusBar para garantir que nada fique sob o relógio
const STICKY_TOP_PADDING = Platform.OS === "android" ? StatusBar.currentHeight + 10 : 10;

const COLORS = {
  background: "#121212",
  surface: "#1E1E1E",
  surfaceLight: "#2C2C2C",
  primary: "#3D5AFE",
  accent: "#00E5FF",
  textPrimary: "#FFFFFF",
  textSecondary: "#B0B0B0",
  border: "#333333"
};

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

  // ... (useEffect e outras funções permanecem iguais)
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
    setLoading(true);
    try {
      const res = await axios.get(`${SERVER_URL}/api/songs`);
      setSongs(res.data);
      setFilteredSongs(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
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
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} translucent={false} />
      <View style={styles.contentWrapper}>
        <View style={styles.glassCard}>
          <Text style={styles.title2}>Configuração de Rede</Text>
          <Text style={styles.label}>Endereço do Servidor:</Text>
          <TextInput style={styles.input} value={ipInput} onChangeText={setIpInput} placeholderTextColor="#666" />
          <TouchableOpacity style={styles.modernButton} onPress={() => {setServerIp(ipInput); setShowIpScreen(false);}}>
            <Text style={styles.buttonText}>Salvar Manual</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modernButton, {backgroundColor: COLORS.surfaceLight, marginTop: 12, borderWidth: 1, borderColor: COLORS.accent}]} onPress={async () => {
            const { granted } = await requestPermission();
            if(granted) { setScanned(false); setScanModalVisible(true); }
          }}>
            <Text style={[styles.buttonText, {color: COLORS.accent}]}>Escanear QR Code</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Modal visible={scanModalVisible} animationType="slide">
        <CameraView style={StyleSheet.absoluteFill} onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} />
        <TouchableOpacity style={styles.closeButton} onPress={()=>setScanModalVisible(false)}>
            <Text style={{color:'#fff', fontWeight: 'bold'}}>CANCELAR</Text>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );

  if (screen === "login") return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} translucent={false} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flexFill}>
        <View style={styles.loginContentWrapper}>
          <TouchableOpacity style={styles.settingsButton} onPress={() => setShowIpScreen(true)}>
            <Text style={{fontSize: 28}}>⚙️</Text>
          </TouchableOpacity>
          
          <View style={styles.logoContainer}>
              <Text style={styles.logoText}>ECHO</Text>
              <Text style={styles.subLogoText}>Admin System</Text>
          </View>

          <View style={styles.formCard}>
              <TextInput 
                  style={styles.input} 
                  placeholder="Usuário" 
                  placeholderTextColor="#666"
                  value={username} 
                  onChangeText={setUsername} 
                  autoCapitalize="none"
              />
              <TextInput 
                  style={styles.input} 
                  placeholder="Senha" 
                  placeholderTextColor="#666"
                  secureTextEntry 
                  value={password} 
                  onChangeText={setPassword} 
              />
              <TouchableOpacity style={styles.modernButton} onPress={doLogin}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>ACESSAR</Text>}
              </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  if (screen === "main") return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.surface} translucent={false} />
      <View style={styles.mainHeader}>
        <Text style={styles.headerTitle}>Músicas</Text>
        <TextInput 
            style={styles.searchInput} 
            placeholder="Pesquisar..." 
            placeholderTextColor="#888"
            value={searchText} 
            onChangeText={(t)=>{
                setSearchText(t); 
                setFilteredSongs(songs.filter(s => 
                    s.titulo.toLowerCase().includes(t.toLowerCase()) || 
                    s.banda.toLowerCase().includes(t.toLowerCase())
                ));
            }} 
        />
      </View>

      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({item, index}) => (
          <TouchableOpacity 
            style={[styles.songCard, { backgroundColor: index % 2 === 0 ? COLORS.surface : COLORS.surfaceLight }]} 
            onPress={()=>openSongLocal(item)}
          >
            <View>
                <Text style={styles.songTitle}>{item.titulo}</Text>
                <Text style={styles.songBanda}>{item.banda}</Text>
            </View>
            <Text style={styles.songTom}>{item.tom}</Text>
          </TouchableOpacity>
        )}
      />

      <View style={styles.bottomBar}>
        <View style={styles.switchGroup}>
            <Text style={styles.switchLabel}>Modo Músico</Text>
            <Switch 
                value={isMusician} 
                onValueChange={setIsMusician} 
                trackColor={{ false: "#333", true: COLORS.primary }}
            />
        </View>
        {userLevel === "Router" && (
          <TouchableOpacity 
            onPress={()=>toggleRouter(!isRouter)} 
            style={[styles.routerBtn, {backgroundColor: isRouter ? "#d32f2f" : COLORS.primary}]}
          >
            <Text style={styles.buttonText}>{isRouter ? "LIBERAR" : "ROUTER"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );

  if (screen === "song") return (
    <SafeAreaView style={styles.safeContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.surface} translucent={false} />
        <View style={styles.songHeader}>
          <Text style={styles.songDisplayTitle}>{selectedSong?.titulo}</Text>
          <Text style={styles.songDisplayBanda}>{selectedSong?.banda}</Text>
        </View>
        <ScrollView style={styles.lyricsContainer}>
            <Text style={styles.lyricsText}>
                {isMusician ? selectedSong?.cifra : selectedSong?.letra}
            </Text>
        </ScrollView>
        <TouchableOpacity style={styles.backButton} onPress={()=>setScreen("main")}>
            <Text style={styles.buttonText}>VOLTAR</Text>
        </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Container base com fundo e ajuste de StatusBar
  safeContainer: { 
    flex: 1, 
    backgroundColor: COLORS.background 
  },
  flexFill: { flex: 1 },
  
  // Login e Configuração
  contentWrapper: { 
    flex: 1, 
    justifyContent: "center", 
    padding: 25 
  },
  loginContentWrapper: { 
    flex: 1, 
    justifyContent: "center", 
    padding: 25,
    // Espaço para a engrenagem não bater no relógio
    paddingTop: STICKY_TOP_PADDING 
  },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  logoText: { fontSize: 50, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 5 },
  subLogoText: { color: COLORS.accent, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' },
  glassCard: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  formCard: { width: '100%' },
  label: { color: COLORS.textSecondary, marginBottom: 8, fontSize: 12 },
  input: { 
    backgroundColor: COLORS.surface, 
    color: COLORS.textPrimary, 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 16
  },
  
  // Tela Principal (Ajustada para o Topo)
  mainHeader: { 
    paddingHorizontal: 20, 
    paddingBottom: 15,
    paddingTop: 10, // O SafeAreaView já lida com o topo aqui, mas StatusBar fixa ajuda
    backgroundColor: COLORS.surface, 
    borderBottomWidth: 1, 
    borderBottomColor: COLORS.border 
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 15 },
  searchInput: { backgroundColor: COLORS.background, color: COLORS.textPrimary, borderRadius: 10, padding: 12, fontSize: 16 },
  
  // Cartão de Música
  songCard: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18, 
    borderBottomWidth: 0.5, 
    borderBottomColor: COLORS.border 
  },
  songTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '600' },
  songBanda: { color: COLORS.textSecondary, fontSize: 14, marginTop: 4 },
  songTom: { color: COLORS.accent, fontWeight: 'bold', fontSize: 16 },

  // Visualização da Cifra
  songHeader: { 
    paddingVertical: 20, 
    paddingHorizontal: 15,
    alignItems: 'center', 
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1, 
    borderBottomColor: COLORS.border 
  },
  songDisplayTitle: { color: COLORS.textPrimary, fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  songDisplayBanda: { color: COLORS.accent, fontSize: 16, marginTop: 5 },
  lyricsContainer: { flex: 1, padding: 20 },
  lyricsText: { 
    color: COLORS.textPrimary, 
    fontSize: 18, 
    lineHeight: 28,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' 
  },

  // Botões e Ícones de Posição
  modernButton: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 12, alignItems: "center", elevation: 4 },
  backButton: { backgroundColor: COLORS.surfaceLight, padding: 20, alignItems: "center" },
  buttonText: { color: COLORS.textPrimary, fontWeight: "800", letterSpacing: 1.2 },
  settingsButton: { 
    position: "absolute", 
    top: 10, 
    right: 10, 
    zIndex: 10,
    padding: 10 // Área de toque maior
  },
  
  // Barra Inferior
  bottomBar: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    padding: 20, 
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  switchGroup: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { color: COLORS.textSecondary, marginRight: 10, fontSize: 14 },
  routerBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  closeButton: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'rgba(255,0,0,0.7)', padding: 15, borderRadius: 30 }
});