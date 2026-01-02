// src/screens/HomeScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useApp } from '../store/appStore';

export default function HomeScreen() {
  const { auth } = useApp();
  const [musicas, setMusicas] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch('http://SEU_IP_LOCAL:5000/cifras') // ajuste IP do servidor Flask
      .then(res => res.json())
      .then(data => setMusicas(data))
      .catch(err => console.error(err));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Olá, {auth.user}</Text>

      <FlatList
        data={musicas}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.item}
            onPress={() => setSelected(item)}
          >
            <Text style={styles.itemTitle}>{item.titulo} - {item.banda}</Text>
          </TouchableOpacity>
        )}
      />

      {selected && (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>{selected.titulo}</Text>
          <Text style={styles.detailText}>
            {auth.isMusician ? selected.cifra : selected.letra}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  item: { padding: 12, backgroundColor: '#eee', marginBottom: 8, borderRadius: 8 },
  itemTitle: { fontSize: 16 },
  detail: { marginTop: 20, padding: 12, backgroundColor: '#fafafa', borderRadius: 8 },
  detailTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  detailText: { fontSize: 14, fontFamily: 'monospace' },
});
