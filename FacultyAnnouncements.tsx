import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import firestore from '@react-native-firebase/firestore';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'FacultyAnnouncements'
>;

const NAVY = '#020120';
const CARD_BG = '#3C5CE0';
const TEXT_DARK = '#0F172A';

type AnnRow = {
  id: string;
  title: string;
  body?: string;
  createdAt?: any;
  pinned?: boolean;
};

/* ───────── helpers ───────── */
const toMillis = (x?: any) =>
  x && typeof x.toDate === 'function'
    ? x.toDate().getTime()
    : x instanceof Date
    ? x.getTime()
    : 0;

const prettyWhen = (ts?: any) => {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const d = ts.toDate();
  return `${d.toLocaleDateString()} • ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

export default function FacultyAnnouncements({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AnnRow[]>([]);

  const mapRef = useRef<Map<string, AnnRow>>(new Map());

  /* ───────── Fetch Faculty Announcements ───────── */
  useEffect(() => {
    const unsub = firestore()
      .collection('announcements')
      .where('visibility', 'in', ['All Faculty', 'All'])
      .onSnapshot(
        snap => {
          const curr = new Map<string, AnnRow>();

          snap.docs.forEach(d => {
            const r = d.data();
            curr.set(d.id, {
              id: d.id,
              title: r?.title || 'Announcement',
              body: r?.content || '',
              createdAt: r?.createdAt,
              pinned: !!r?.pinned,
            });
          });

          const list = Array.from(curr.values()).sort(
            (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
          );

          mapRef.current = curr;
          setRows(list);
          setLoading(false);
        },
        err => {
          console.log('Faculty announcements error:', err);
          setLoading(false);
        }
      );

    return () => unsub();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image
            source={require('./assets/shieldlogo.png')}
            style={styles.brandLogo}
          />
          <Text style={styles.brandText}>Smart</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Profile')}
        >
          <Image
            source={require('./assets/profileblue.png')}
            style={styles.profileIcon}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.pageTitle}>Announcements</Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 30 }} />
        ) : rows.length === 0 ? (
          <Text style={styles.emptyText}>
            No faculty announcements available.
          </Text>
        ) : (
          rows.map(item => (
            <View key={item.id} style={styles.tile}>
              <View style={styles.tileHeader}>
                <Text style={styles.tileTitle}>{item.title}</Text>
                <Text style={styles.tileDate}>
                  {prettyWhen(item.createdAt)}
                </Text>
              </View>

              {!!item.body && (
                <Text style={styles.tileBody}>{item.body}</Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


/* ============== styles ============== */
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NAVY,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#1FA2FF',
  },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  brandLogo: { width: 72, height: 65, resizeMode: 'contain' },
  brandText: {
    fontSize: 42,
    color: '#fff',
    fontFamily: 'Genos-SemiBold',
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  profileBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIconSmall: { width: 18, height: 18, resizeMode: 'contain', tintColor: '#fff' },

  pageTitle: {
    color: TEXT_DARK,
    fontSize: 35,
    fontWeight: '500',
    fontFamily: 'Genos-SemiBold',
    marginTop: 6,
    marginBottom: 12,
    marginLeft: 25,
  },

  statusCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 14,
    paddingTop: 45,
    marginLeft: 20,
    marginRight: 20,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  closeBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FF4D4F',
    alignItems: 'center',
    justifyContent: 'center',
  },

  tile: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  tileHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  leftIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  iconTxt: { fontSize: 16 },
  tileTitle: { color: TEXT_DARK, fontSize: 14, fontWeight: '900', flex: 1 },
  rightPill: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#F1F5F9', borderRadius: 999 },
  rightPillText: { fontSize: 11, color: '#334155', fontWeight: '800' },

  tileSub: { color: '#334155', fontSize: 12, marginTop: 2 },

  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  badge: { width: 12, height: 12, borderRadius: 6 },
  statusText: { color: '#0f172a', fontSize: 12, fontWeight: '700' },

  pagerRow: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  pageIndicator: { color: '#111827', fontWeight: '700' },
  pagerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerIconBtnDisabled: { opacity: 0.5 },
  pagerIcon: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 20 },
    swipeActionWrap: {
    width: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeActionButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#ef4444',
    height: '80%',
    borderRadius: 6,
  },
  swipeText: {
    color: '#fff',
    fontWeight: '800',
  },
  

  tileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  tileDate: { fontSize: 12, color: '#64748B' },
  tileBody: { fontSize: 14, color: '#334155' },
  profileIcon: { width: 18, height: 18, resizeMode: 'contain', tintColor: '#fff' },
  
   emptyText: {
    textAlign: 'center',
    color: '#64748B',
    marginTop: 40,
    fontSize: 14,
  },

});
