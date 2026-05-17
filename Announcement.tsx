// AnnouncementsScreen.tsx
import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView } from 'react-native';

type Announcement = {
  id: string;
  title: string;
  from: string;
  dateISO: string;
  message: string;
  read?: boolean;
};

const MOCK: Announcement[] = [
  {
    id: '1',
    title: 'Dress Code Reminder',
    from: 'OSA',
    dateISO: '2025-05-08',
    message: 'Please assist in implementing the dress code. Thank you!',
    read: false,
  },
  {
    id: '2',
    title: 'Campus Drill',
    from: 'Security Office',
    dateISO: '2025-05-09',
    message: 'Emergency drill on Friday at 10 AM. Proceed to the nearest exit.',
    read: true,
  },
];

export default function AnnouncementsScreen() {
  const [data] = useState(MOCK);

  const renderItem = ({ item }: { item: Announcement }) => (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        {!item.read && <View style={styles.dot} />}
        <Text style={styles.title} numberOfLines={1}>Title: <Text style={styles.value}>{item.title}</Text></Text>
      </View>
      <Text style={styles.kv}>From: <Text style={styles.value}>{item.from}</Text></Text>
      <Text style={styles.kv}>Date: <Text style={styles.value}>
        {new Date(item.dateISO).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
      </Text></Text>
      <Text style={[styles.kv, { marginTop: 6 }]}>Message:</Text>
      <Text style={styles.msg}>{item.message}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.header}>Announcements</Text>
      <FlatList
        data={data}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<Text style={styles.empty}>No announcements yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D1233', paddingHorizontal: 16, paddingTop: 12 },
  header: { color: 'white', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  card: { backgroundColor: '#3C62D8', borderRadius: 14, padding: 14, marginVertical: 8, elevation: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFCC00', marginRight: 8 },
  title: { color: '#E6EBFF', fontWeight: '700' },
  kv: { color: '#E6EBFF', fontWeight: '700', marginTop: 2 },
  value: { color: 'white', fontWeight: '500' },
  msg: { color: 'white', marginTop: 4, lineHeight: 20 },
  empty: { color: '#B8C1FF', textAlign: 'center', marginTop: 32 },
});
