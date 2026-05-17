import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  SafeAreaView, View, Text, StyleSheet, Image,
  TouchableOpacity, TextInput, ScrollView, Alert, Animated
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { Swipeable, RectButton } from 'react-native-gesture-handler';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

const NAVY = '#020120';
const BLUE = '#3C5CE0';
const TEXT_DARK = '#0F172A';

type ViolationDoc = {
  id: string;
  createdAt?: FirebaseFirestoreTypes.Timestamp | null;
  violation?: string;
  studentName?: string;
  studentID?: string;
  location?: string;
  evidenceUrl?: string | null;
  comment?: string;
};

export default function GuardHistory({ navigation }: Props) {
  const [queryText, setQueryText] = useState('');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ViolationDoc[]>([]);
  const swipeables = useRef<Record<string, Swipeable | null>>({});

  useEffect(() => {
    setLoading(true);
    const unsub = firestore()
      .collection('violations')
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        (snap) => {
          const items: ViolationDoc[] = snap.docs.map((d) => {
            const x = d.data() as any;
            return {
              id: d.id,
              createdAt: x.createdAt ?? null,
              violation: x.violation ?? '',
              studentName: x.studentName ?? '',
              studentID: x.studentId || x.studentID || '',
              location: x.location ?? '',
              evidenceUrl: x.evidenceUrl ?? null,
              comment: x.comment ?? '',
            };
          });
          setEntries(items);
          setLoading(false);
        },
        (err) => {
          console.error(err);
          Alert.alert('Error', 'Failed to load history.');
          setLoading(false);
        }
      );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      (e.violation || '').toLowerCase().includes(q) ||
      (e.studentName || '').toLowerCase().includes(q) ||
      (e.studentID || '').toLowerCase().includes(q) ||
      (e.location || '').toLowerCase().includes(q) ||
      (e.comment || '').toLowerCase().includes(q)
    );
  }, [entries, queryText]);

  const formatDate = (ts?: FirebaseFirestoreTypes.Timestamp | null) => {
    try {
      if (!ts) return '—';
      const d = ts.toDate();
      return d.toLocaleDateString();
    } catch {
      return '—';
    }
  };

  async function confirmAndDelete(id: string) {
    Alert.alert(
      'Delete violation',
      'Are you sure you want to delete this violation? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setEntries(prev => prev.filter(x => x.id !== id));
            try {
              await firestore().collection('violations').doc(id).delete();
            } catch (err) {
              console.error('Delete failed', err);
              Alert.alert('Error', 'Failed to delete. It may reappear after refresh.');
            }
          }
        }
      ]
    );
  }

  const renderRightActions = (id: string, _progress: Animated.Value, dragX: Animated.Value) => {
    const scale = (dragX as any).interpolate
      ? (dragX as any).interpolate({ inputRange: [-120, 0], outputRange: [1, 0.9], extrapolate: 'clamp' })
      : 1;

    return (
      <RectButton
        onPress={() => confirmAndDelete(id)}
        style={{
          width: 96,
          backgroundColor: '#ef4444',
          justifyContent: 'center',
          alignItems: 'center',
          marginVertical: 6,
          borderRadius: 8,
        }}
      >
        <Animated.Text style={{ color: '#fff', fontWeight: '700', paddingHorizontal: 10, transform: [{ scale }] }}>
          Delete
        </Animated.Text>
      </RectButton>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.brandWrap}>
          <Image source={require('./assets/shieldlogo.png')} style={s.logo} />
          <Text style={s.brandText}>Smart</Text>
        </View>

        <TouchableOpacity style={s.profileBubble} onPress={() => navigation.navigate('Profile')}>
          <Image source={require('./assets/profileblue.png')} style={s.profileIcon} />
        </TouchableOpacity>
      </View>

      {/* === CIRCLE BACK BUTTON === */}
      <View style={s.backCircleWrap}>
        <TouchableOpacity style={s.backCircleBtn} onPress={() => navigation.goBack()}>
          <Image source={require('./assets/left-arrow.png')} style={s.backCircleIcon} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>All Violations</Text>

        <View style={s.topRow}>
          <View style={s.searchWrap}>
            <Image source={require('./assets/search.png')} style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              placeholder="Search by name, ID, violation..."
              placeholderTextColor="#9CA3AF"
              value={queryText}
              onChangeText={setQueryText}
            />
          </View>
        </View>

        <Text style={s.sectionLabel}>
          {loading ? 'Loading…' : `Violations (${filtered.length})`}
        </Text>

        <View style={{ gap: 12 }}>
          {filtered.map((e) => (
            <Swipeable
              key={e.id}
              ref={(ref) => { swipeables.current[e.id] = ref; }}
              friction={2}
              overshootRight={false}
              renderRightActions={(progress, dragX) =>
                renderRightActions(e.id, progress as any, dragX as any)
              }
            >
              <View style={s.violationCard}>
                <Row label="Date:" value={formatDate(e.createdAt)} />
                <Row label="Student:" value={`${e.studentName || '—'} (${e.studentID || '—'})`} />
                <Row label="Violation:" value={e.violation || '—'} />
                <Row label="Comment:" value={e.comment || '—'} multiline />
              </View>
            </Swipeable>
          ))}
          {!loading && filtered.length === 0 && (
            <Text style={{ textAlign: 'center', color: '#6B7280', marginTop: 8 }}>
              No violations found.
            </Text>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const Row: React.FC<{ label: string; value: string; multiline?: boolean }> = ({ label, value, multiline }) => (
  <View style={s.pairRow}>
    <Text style={s.pairLabel}>{label}</Text>
    <Text style={[s.pairValue, multiline && { lineHeight: 18 }]} numberOfLines={multiline ? 0 : 1}>
      {value}
    </Text>
  </View>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NAVY,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#1FA2FF',
  },

  brandWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { width: 80, height: 80, resizeMode: 'contain' },
  brandText: { fontSize: 45, color: '#fff', fontFamily: 'Genos-SemiBold', fontWeight: '400' },

  profileBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIcon: { width: 18, height: 18, resizeMode: 'contain', tintColor: '#fff' },

  /* Back row below header */
  backRowWrap: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderBottomWidth: 0,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // give it a touch-friendly hit area
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',


  },
  backText: {
    fontSize: 18,
    color: NAVY,
    fontWeight: '600',
    fontFamily: 'Inter',
  },

content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },

  title: {
    fontSize: 35,
    color: TEXT_DARK,
    fontFamily: 'Genos-SemiBold',
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },

  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 36,
  },
  searchIcon: { width: 20, height: 20, tintColor: '#6B7280', marginRight: 3, resizeMode: 'contain' },
  searchInput: { flex: 1, marginBottom: -3, fontSize: 16, color: '#111827', fontFamily: 'Inter', fontWeight: '500' },

  sectionLabel: {
    fontSize: 25,
    color: TEXT_DARK,
    fontFamily: 'Genos-SemiBold',
    fontWeight: '600',
    marginBottom: 8,
  },

  violationCard: {
    backgroundColor: BLUE,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'center',
    marginHorizontal: 10,
  },

  pairRow: { flexDirection: 'row', marginBottom: 6 },
  pairLabel: { width: 92, color: '#fff', fontSize: 16, fontFamily: 'Inter', fontWeight: '700' },
  pairValue: { flex: 1, color: '#fff', fontSize: 16, fontFamily: 'Inter', fontWeight: '600' },

  // --- Circle Back Button Styles ---
  backCircleWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    marginBottom: -49, // more space under the arrow
        zIndex: 20
  },


  backCircleBtn: {
    width: 35,
    height: 35,
    borderRadius: 21,
    backgroundColor: '#E5E7EB', // Light gray (change if needed)
    justifyContent: 'center',
    alignItems: 'center',
    marginTop:30,
    marginLeft:9,
  },

  backCircleIcon: {
    width: 18,
    height: 18,
    tintColor: '#0F172A', // dark navy
  },


});
