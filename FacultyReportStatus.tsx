// FacultyReportStatus.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import auth from '@react-native-firebase/auth';
import { Swipeable } from 'react-native-gesture-handler';

type Props = NativeStackScreenProps<RootStackParamList, 'FacultyReportStatus'>;

/* ---------------- CONSTANTS ---------------- */
const NAVY = '#020120';
const CARD_BG = '#3C5CE0';
const TEXT_DARK = '#0F172A';

/* ---------------- TYPES ---------------- */
type ViolationRow = {
  kind: 'violation';
  id: string;
  studentID?: string;
  studentName?: string;
  category?: string;
  violation?: string;
  status: string;
  createdAt?: any;
};

type Row = ViolationRow;

/* ---------------- HELPERS ---------------- */
const capitalize = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : '');

const prettyApplied = (ts?: any) => {
  const d =
    ts && typeof ts.toDate === 'function'
      ? ts.toDate()
      : ts instanceof Date
      ? ts
      : null;
  if (!d) return '';
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

const normalizeStatus = (s?: string) => {
  const v = (s || '').toLowerCase();

  if (v === 'sanction' || v === 'sanctioned') return 'sanction';
  if (v === 'rejected' || v === 'dismissed') return 'rejected';

  // everything else defaults to pending
  return 'pending';
};

const statusBadgeColor = (s?: string) => {
  const v = normalizeStatus(s);
  if (v === 'sanction') return '#f97316'; // orange
  if (v === 'rejected') return '#ef4444'; // red
  return '#f59e0b'; // pending (yellow)
};
/* ---------------- COMPONENT ---------------- */
export default function FacultyReportStatus({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;

  const vioMap = useRef<Record<string, ViolationRow>>({});

  useEffect(() => {
    const uid = auth().currentUser?.uid;
    if (!uid) return;

    const unsub = firestore()
      .collection('violations')
      .where('createdByUid', '==', uid)
      .onSnapshot((snap) => {
        const map: Record<string, ViolationRow> = {};
        snap.docs.forEach((d) => {
          const r = d.data();
          map[d.id] = {
            kind: 'violation',
            id: d.id,
            studentID: r.studentID,
            studentName: r.studentName,
            category: r.category,
            violation: r.violation,
            status: r.status || 'pending',
            createdAt: r.createdAt,
          };
        });
        vioMap.current = map;
        const merged = Object.values(map).sort(
          (a: any, b: any) =>
            (b.createdAt?.toDate?.()?.getTime?.() || 0) -
            (a.createdAt?.toDate?.()?.getTime?.() || 0)
        );
        setRows(merged);
        setLoading(false);
      });

    return () => unsub();
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [rows, page]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* HEADER — SAME AS STUDENT */}
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image source={require('./assets/shieldlogo.png')} style={styles.brandLogo} />
          <Text style={styles.brandText}>Smart</Text>
        </View>
<TouchableOpacity
  style={styles.profileBubble}
  activeOpacity={0.8}
  onPress={() => navigation.navigate('Profile')}
>
  <Image
    source={require('./assets/profileblue.png')}
    style={styles.profileIconSmall}
  />
</TouchableOpacity>

      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.pageTitle}>Report Status</Text>

        <View style={styles.statusCard}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={{ color: '#fff', fontWeight: '900' }}>✕</Text>
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator />
          ) : pageItems.length === 0 ? (
            <Text style={styles.tileSub}>No reports yet.</Text>
          ) : (
            pageItems.map((v) => (
              <Swipeable key={v.id}>
                <View style={styles.tile}>
                  <View style={styles.tileHeaderRow}>
                    <View style={styles.leftIcon}>
                      <Text style={styles.iconTxt}>🚨</Text>
                    </View>

                    <Text style={styles.tileTitle}>
                      {capitalize(v.violation || 'Violation')}
                    </Text>

                    <View style={styles.rightPill}>
                      <Text style={styles.rightPillText}>
                        Applied: {prettyApplied(v.createdAt)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.tileSub}>
                    Student: {v.studentName} ({v.studentID})
                  </Text>
                  <Text style={styles.tileSub}>
                    Category: {capitalize(v.category)}
                  </Text>

<View style={styles.statusRow}>
  <View
    style={[
      styles.badge,
      { backgroundColor: statusBadgeColor(v.status) },
    ]}
  />
  <Text style={styles.statusText}>
    Status: {capitalize(normalizeStatus(v.status))}
  </Text>
</View>

                </View>
              </Swipeable>
            ))
          )}

          {/* PAGINATION — SAME AS STUDENT */}
          <View style={styles.pagerRow}>
            <TouchableOpacity
              style={[styles.pagerIconBtn, page === 0 && styles.pagerIconBtnDisabled]}
              onPress={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <Text style={styles.pagerIcon}>‹</Text>
            </TouchableOpacity>

            <Text style={styles.pageIndicator}>
              Page {page + 1} / {totalPages}
            </Text>

            <TouchableOpacity
              style={[
                styles.pagerIconBtn,
                page >= totalPages - 1 && styles.pagerIconBtnDisabled,
              ]}
              onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <Text style={styles.pagerIcon}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
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

  swipeActionWrap: { width: 120, justifyContent: 'center', alignItems: 'center' },
  swipeActionButton: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, backgroundColor: '#ef4444', height: '80%', borderRadius: 6 },
  swipeText: { color: '#fff', fontWeight: '800' },
  pagerIconBtnDisabled: { opacity: 0.5 },
  pagerIcon: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 20 },
   modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  confirmModal: { width: '86%', backgroundColor: '#fff', borderRadius: 12, padding: 18, alignItems: 'center' },
  confirmTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  confirmMessage: { textAlign: 'center', color: '#475569', marginBottom: 16 },
  confirmButtons: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  confirmBtn: { flex: 1, paddingVertical: 10, marginHorizontal: 6, borderRadius: 8, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '800' },
  confirmBtnTextDark: { color: '#111827', fontWeight: '700' },
});


