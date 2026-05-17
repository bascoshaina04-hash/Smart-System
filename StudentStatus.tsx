import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Modal,
} from 'react-native';

import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import { Swipeable } from 'react-native-gesture-handler';
import QRCode from 'react-native-qrcode-svg';

type Props = NativeStackScreenProps<RootStackParamList, 'StudentStatus'>;

const NAVY = '#020120';
const CARD_BG = '#3C5CE0';
const TEXT_DARK = '#0F172A';

type Appt = {
  id: string;
  office: string;
  purpose?: string;
  date?: string;
  time?: string;
  concern?: string;
  status: string;
  createdAt?: any;
};

type Row =
  | ({ kind: 'appointment' } & Appt)

  | ({
      kind: 'goodmoral';
      id: string;
      office: string;
      documentType: string;
      preferredDate?: string;
      status: string;
      purpose?: string;
      createdAt?: any;
    })

  | ({
      kind: 'incident';
      id: string;
      category: string;
      details: string;
      location?: string;
      occurredDate?: string;
      status: string;
      sanctionRemarks?: string;
      office: string;
      createdAt?: any;
      preferredDate?: string;
    })
| ({
      kind: 'specialpass';
      id: string;
      office: string;
      reasonType: string;
      reasonDetails?: string;
      status: string;
      createdAt?: any;
      startDate?: string;
      expirationDate?: string;
    });
/* ----------------- helpers ----------------- */
const parseApptDate = (dateISO?: string, timeHHmm?: string) => {
  if (!dateISO) return null;
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  if (timeHHmm) {
    const [hh, mm] = timeHHmm.split(':').map(Number);
    dt.setHours(hh || 0, mm || 0, 0, 0);
  }
  return dt;
};

const prettyDate = (date?: any) => {
  if (!date) return '';

  const dt = date instanceof Date ? date : new Date(date);

  const month = dt.toLocaleString([], { month: 'short' });
  const day = dt.getDate();
  return `${month} ${day}`;
};

const prettyDateTime = (dateISO?: string, timeHHmm?: string) => {
  const dt = parseApptDate(dateISO, timeHHmm);
  if (!dt) return '';
  const month = dt.toLocaleString([], { month: 'short' });
  const day = dt.getDate();
  const time = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${month} ${day} — ${time}`;
};

const prettyApplied = (ts?: any) => {
  const d: Date | null =
    ts && typeof ts.toDate === 'function' ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!d) return '';
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${date} • ${time}`;
};

const capitalize = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const statusBadgeColor = (s?: string) => {
  const v = (s || '').toLowerCase();
  if (v === 'approved') return '#22c55e';//hello
  if (v === 'pending') return '#f59e0b';
  if (v === 'rejected') return '#313131ff';
    if (v === 'sanctioned') return '#ee7878ff'; // ← THIS ONE
  return '#94a3b8';
};

async function resolveStudentId(): Promise<{ studentID: string; uid: string }> {
  const user = auth().currentUser;
  const uid = user?.uid || '';
  const emailLocal = ((user?.email || '').split('@')[0] || '').trim();

  const cached = (await AsyncStorage.getItem('currentStudentID')) || '';

  let fromUsers = '';
  if (uid) {
    try {
      const udoc = await firestore().collection('users').doc(uid).get();
      fromUsers = String(udoc.data()?.studentID || udoc.data()?.studentId || '');
    } catch {}
  }

  let fromStudents = '';
  if (uid) {
    try {
      const sdoc = await firestore().collection('students').doc(uid).get();
      fromStudents = String(sdoc.data()?.studentID || sdoc.data()?.studentId || '');
    } catch {}
  }

  const chosen =
    String(cached || '').trim() ||
    String(fromUsers || '').trim() ||
    String(fromStudents || '').trim() ||
    '';

  const studentID = chosen || emailLocal;
  console.log('[StudentStatus] resolved studentID =', studentID, 'uid=', uid);
  return { studentID, uid };
}

/* ---------------- component ---------------- */
export default function StudentStatus({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;

  // modal state for confirmation
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<Row | null>(null);

  const apptsRef = useRef<Row[]>([]);
  const gmrRef = useRef<Row[]>([]);
 const incidentsRef = useRef<Row[]>([]);
 const specialPassRef = useRef<Row[]>([]);


  // when deleting, mark id here so listeners ignore briefly and prevent re-adding
  const recentlyDeleted = useRef(new Set<string>());

  // AsyncStorage key for short-lived tombstones
  const STORAGE_KEY = '@smart_deleted_tombstones';
  // TTL for tombstone in ms (5 minutes)
  const TOMBSTONE_TTL = 5 * 60 * 1000;

  const getAppliedTs = (r: Row): number => {
    const ts = (r as any).createdAt;
    const applied =
      ts && typeof ts.toDate === 'function' ? ts.toDate() : ts instanceof Date ? ts : null;

    if (applied) return applied.getTime();

    if (r.kind === 'appointment') {
      const t = parseApptDate(r.date, r.time)?.getTime();
      if (t) return t;
    } else {
    const t = parseApptDate((r as any).preferredDate)?.getTime();
      if (t) return t;
    }
    return 0;
  };

const mergeAll = () => {

const combined = [
...apptsRef.current,
...gmrRef.current,
...incidentsRef.current,
...specialPassRef.current
];

combined.sort((a, b) => getAppliedTs(b) - getAppliedTs(a));

setRows(combined);
setLoading(false);
setPage(0);

};

  /* -------- tombstone helpers (persist deleted ids briefly) -------- */
  const loadTombstones = async () => {
    try {
      const raw = (await AsyncStorage.getItem(STORAGE_KEY)) || '{}';
      const obj = JSON.parse(raw) as Record<string, number>;
      const now = Date.now();
      const pruned: Record<string, number> = {};
      Object.entries(obj).forEach(([id, ts]) => {
        if (now - ts < TOMBSTONE_TTL) {
          pruned[id] = ts;
          recentlyDeleted.current.add(id);
        }
      });
      // write pruned back (clean up expired entries)
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch (e) {
      console.log('loadTombstones error', e);
    }
  };

  const addTombstone = async (id: string) => {
    try {
      const raw = (await AsyncStorage.getItem(STORAGE_KEY)) || '{}';
      const obj = JSON.parse(raw) as Record<string, number>;
      obj[id] = Date.now();
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
      recentlyDeleted.current.add(id);
      // schedule removal after TTL in-memory (and rely on loadTombstones to prune on mount)
      setTimeout(async () => {
        try {
          const r = (await AsyncStorage.getItem(STORAGE_KEY)) || '{}';
          const o = JSON.parse(r) as Record<string, number>;
          delete o[id];
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(o));
          recentlyDeleted.current.delete(id);
        } catch (err) {
          // ignore
        }
      }, TOMBSTONE_TTL + 500);
    } catch (e) {
      console.log('addTombstone error', e);
    }
  };

  useEffect(() => {
    // populate tombstones from storage before listeners attach
    loadTombstones();
  }, []);

  useEffect(() => {
    let unsubApptByStudentID: (() => void) | null = null;
    let unsubApptByStudentId: (() => void) | null = null;
    let unsubApptByUID: (() => void) | null = null;
    let unsubGMR: (() => void) | null = null;
    let unsubIncidents: (() => void) | null = null;
    let unsubSpecialPass: (() => void) | null = null;
    
    (async () => {
      setLoading(true);

      const { studentID, uid } = await resolveStudentId();
      if (!studentID && !uid) {
        Alert.alert('Profile', 'We could not resolve your Student ID yet.');
        setLoading(false);
        return;
      }

      const startApptListener = (
        field: 'studentID' | 'studentId' | 'createdByUid',
        value: string,
        onDone: () => void
      ) => {
        const q = firestore().collection('appointments').where(field, '==', value);
        return q.onSnapshot(
          (snap: FirebaseFirestoreTypes.QuerySnapshot<FirebaseFirestoreTypes.DocumentData>) => {
            const map = new Map<string, Row>(apptsRef.current.map((r) => [r.id, r]));
            snap.docs.forEach(
              (d: FirebaseFirestoreTypes.QueryDocumentSnapshot<FirebaseFirestoreTypes.DocumentData>) => {
                // skip if it was recently deleted locally to avoid race re-add
                if (recentlyDeleted.current.has(d.id)) return;

                const r = d.data() as any;

                map.set(d.id, {
                  kind: 'appointment',
                  id: d.id,
                  office: String(r.office || ''),
                  purpose: r.purpose ? String(r.purpose) : undefined,
                  date: r.date ? String(r.date) : undefined,
                  time: r.time ? String(r.time) : undefined,
                  concern: r.concern ? String(r.concern) : undefined,
                  status: String(r.status || 'pending'),
                  createdAt: r.createdAt || r.created_at || r.submittedAt || null,
                } as Row);
              }
            );

            apptsRef.current = Array.from(map.values());
            console.log(`[appointments:${field}] matched =`, snap.size);
            onDone();
          },
          (err: any) => {
            console.log(`appointments listen error (${field})`, err);
            onDone();
          }
        );
      };

      if (studentID) {
        unsubApptByStudentID = startApptListener('studentID', studentID, mergeAll);
        unsubApptByStudentId = startApptListener('studentId', studentID, mergeAll);
      }
      if (uid) {
        unsubApptByUID = startApptListener('createdByUid', uid, mergeAll);
      }

      let gmQuery: FirebaseFirestoreTypes.Query<FirebaseFirestoreTypes.DocumentData> =
        firestore().collection('goodMoralRequest');
      gmQuery = uid ? gmQuery.where('createdByUid', '==', uid) : gmQuery.where('studentId', '==', studentID);

      unsubGMR = gmQuery.onSnapshot(
        (snap: FirebaseFirestoreTypes.QuerySnapshot<FirebaseFirestoreTypes.DocumentData>) => {
          gmrRef.current = snap.docs
            .filter((d) => !recentlyDeleted.current.has(d.id))
            .map(
              (d: FirebaseFirestoreTypes.QueryDocumentSnapshot<FirebaseFirestoreTypes.DocumentData>) => {
                const r = d.data() as any;
                return {
                  kind: 'goodmoral',
                  id: d.id,
                  office: String(r.office || 'osa'),
                  documentType: String(r.documentType || 'Good Moral Certificate'),
                  preferredDate: r.preferredDate ? String(r.preferredDate) : undefined,
                  status: String(r.status || 'pending'),
                  purpose: r.purpose ? String(r.purpose) : undefined,
                  createdAt: r.createdAt || r.created_at || r.submittedAt || null,
                } as Row;
              }
            );
          console.log('[goodMoralRequest] matched =', snap.size);
          mergeAll();
        },
        (err: any) => {
          console.log('goodMoralRequest listen error', err);
          gmrRef.current = [];
          mergeAll();
        }
      );
      // INCIDENT REPORTS (submitted by student)
unsubIncidents = firestore()
  .collection('incidentReports')
  .where('studentID', '==', studentID)
  .onSnapshot(
    (snap) => {
      incidentsRef.current = snap.docs
        .filter(d => !recentlyDeleted.current.has(d.id))
        .map(d => {
          const r = d.data() as any;

          return {
            kind: 'incident',
            id: d.id,

            // basic incident info
            category: String(r.kind || 'Incident'),
            details: String(r.details || ''),
            location: r.location ? String(r.location) : undefined,
            occurredDate: r.occurredDate ? String(r.occurredDate) : undefined,

            // 🔴 IMPORTANT FIELDS YOU ASKED FOR
            status: String(r.status || 'pending'),
            sanctionRemarks: r.sanctionRemarks
              ? String(r.sanctionRemarks)
              : undefined,

            office: String(r.office || 'osa'),
            createdAt: r.createdAt || r.updatedAt || null,
          } as Row;
        });

      console.log('[incidentReports] matched =', snap.size);
      mergeAll();
    },
    (err) => {
      console.log('incidentReports listen error', err);
      incidentsRef.current = [];
      mergeAll();
    }
    
  );
unsubSpecialPass = firestore()
.collection('specialPassRequests')
.where('createdByUid', '==', uid)
.onSnapshot(
(snap) => {

specialPassRef.current = snap.docs
.filter(d => !recentlyDeleted.current.has(d.id))
.map(d => {

const r = d.data() as any;

return {
kind: 'specialpass',
id: d.id,
office: String(r.office || 'osa'),
reasonType: String(r.reasonType || ''),
reasonDetails: String(r.reasonDetails || ''),
status: String(r.status || 'pending'),
createdAt: r.createdAt || null,
startDate: r.startDate?.toDate?.(),
expirationDate: r.expirationDate?.toDate?.()
} as any;

});

console.log('[specialPassRequests] matched =', snap.size);

mergeAll();

},
(err) => {
console.log('specialPassRequests listen error', err);
specialPassRef.current = [];
mergeAll();
}
);

    })();

    return () => {
      unsubApptByStudentID && unsubApptByStudentID();
      unsubApptByStudentId && unsubApptByStudentId();
      unsubApptByUID && unsubApptByUID();
      unsubGMR && unsubGMR();
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageItems = useMemo(() => rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [rows, page]);
  const hasData = rows.length > 0;

  /* ----------------- modal confirm + delete helpers ----------------- */

  const confirmDelete = (row: Row) => {
    setRowToDelete(row);
    setConfirmVisible(true);
  };

  // Actually perform the delete (server-first) with local tombstone to avoid re-add
  const performDelete = async (row: Row) => {
    if (!row) return;
    setConfirmVisible(false);

    // store snapshot to rollback if needed
    const prevAppts = apptsRef.current.slice();
    const prevGmr = gmrRef.current.slice();
    const prevRows = rows.slice();

    try {
      // 1) delete server-side (wait for confirmation)
  if (row.kind === 'appointment') {
  await firestore().collection('appointments').doc(row.id).delete();
} else if (row.kind === 'goodmoral') {
  await firestore().collection('goodMoralRequest').doc(row.id).delete();
} else if (row.kind === 'incident') {
  await firestore().collection('incidentReports').doc(row.id).delete();
}


      // 2) add tombstone (persisted short term) so listeners don't re-add it on remount
      await addTombstone(row.id);

      // 3) remove locally and rebuild
      apptsRef.current = apptsRef.current.filter((r) => r.id !== row.id);
      gmrRef.current = gmrRef.current.filter((r) => r.id !== row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));

      // 4) quick refetch to fully resync caches (best-effort)
      try {
        const { studentID, uid } = await resolveStudentId();
        const apptMap = new Map<string, Row>();
        if (studentID) {
          const snapA = await firestore().collection('appointments').where('studentID', '==', studentID).get();
          snapA.docs.forEach((d) => {
            if (recentlyDeleted.current.has(d.id)) return;
            const r = d.data() as any;
            apptMap.set(d.id, {
              kind: 'appointment',
              id: d.id,
              office: String(r.office || ''),
              purpose: r.purpose ? String(r.purpose) : undefined,
              date: r.date ? String(r.date) : undefined,
              time: r.time ? String(r.time) : undefined,
              concern: r.concern ? String(r.concern) : undefined,
              status: String(r.status || 'pending'),
              createdAt: r.createdAt || r.created_at || r.submittedAt || null,
            } as Row);
          });

          const snapB = await firestore().collection('appointments').where('studentId', '==', studentID).get();
          snapB.docs.forEach((d) => {
            if (recentlyDeleted.current.has(d.id)) return;
            const r = d.data() as any;
            apptMap.set(d.id, {
              kind: 'appointment',
              id: d.id,
              office: String(r.office || ''),
              purpose: r.purpose ? String(r.purpose) : undefined,
              date: r.date ? String(r.date) : undefined,
              time: r.time ? String(r.time) : undefined,
              concern: r.concern ? String(r.concern) : undefined,
              status: String(r.status || 'pending'),
              createdAt: r.createdAt || r.created_at || r.submittedAt || null,
            } as Row);
          });
        }

        if (uid) {
          const snapC = await firestore().collection('appointments').where('createdByUid', '==', uid).get();
          snapC.docs.forEach((d) => {
            if (recentlyDeleted.current.has(d.id)) return;
            const r = d.data() as any;
            apptMap.set(d.id, {
              kind: 'appointment',
              id: d.id,
              office: String(r.office || ''),
              purpose: r.purpose ? String(r.purpose) : undefined,
              date: r.date ? String(r.date) : undefined,
              time: r.time ? String(r.time) : undefined,
              concern: r.concern ? String(r.concern) : undefined,
              status: String(r.status || 'pending'),
              createdAt: r.createdAt || r.created_at || r.submittedAt || null,
            } as Row);
          });
        }

        apptsRef.current = Array.from(apptMap.values());

        let gmQuery = firestore().collection('goodMoralRequest') as FirebaseFirestoreTypes.Query<FirebaseFirestoreTypes.DocumentData>;
        if (uid) {
          gmQuery = gmQuery.where('createdByUid', '==', uid);
        } else if (studentID) {
          gmQuery = gmQuery.where('studentId', '==', studentID);
        }

        const snapG = await gmQuery.get();
        gmrRef.current = snapG.docs
          .filter((d) => !recentlyDeleted.current.has(d.id))
          .map((d) => {
            const r = d.data() as any;
            return {
              kind: 'goodmoral',
              id: d.id,
              office: String(r.office || 'osa'),
              documentType: String(r.documentType || 'Good Moral Certificate'),
              preferredDate: r.preferredDate ? String(r.preferredDate) : undefined,
              status: String(r.status || 'pending'),
              purpose: r.purpose ? String(r.purpose) : undefined,
              createdAt: r.createdAt || r.created_at || r.submittedAt || null,
            } as Row;
          });

        mergeAll();
      } catch (refetchErr) {
        console.log('post-delete refetch error', refetchErr);
        mergeAll();
      }
    } catch (e) {
      console.log('performDelete (server) error', e);
      Alert.alert('Error', 'Could not delete record. It may already be removed or you lack permission.');
      // rollback UI if server delete failed
      apptsRef.current = prevAppts;
      gmrRef.current = prevGmr;
      setRows(prevRows);
      mergeAll();
    }
  };

  // Right actions UI factory — calls confirmDelete when pressed
  const renderRightActions = (row: Row) => {
    return (_progress: any, _dragX: any) => (
      <View style={styles.swipeActionWrap}>
        <TouchableOpacity onPress={() => confirmDelete(row)} style={styles.swipeActionButton} activeOpacity={0.8}>
          <Text style={styles.swipeText}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // legacy direct-delete fallback (kept for safety) — not used by buttons
  const deleteRow = async (row: Row) => {
    apptsRef.current = apptsRef.current.filter((r) => r.id !== row.id);
    gmrRef.current = gmrRef.current.filter((r) => r.id !== row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));

    try {
      if (row.kind === 'appointment') {
        await firestore().collection('appointments').doc(row.id).delete();
      } else {
        await firestore().collection('goodMoralRequest').doc(row.id).delete();
      }
    } catch (e) {
      console.log('deleteRow error', e);
      Alert.alert('Error', 'Could not delete record. It may already be removed.');
      mergeAll();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image source={require('./assets/shieldlogo.png')} style={styles.brandLogo} />
          <Text style={styles.brandText}>Smart</Text>
        </View>
        <TouchableOpacity style={styles.profileBubble} activeOpacity={0.8}>
          <Image source={require('./assets/profileblue.png')} style={styles.profileIconSmall} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={styles.pageTitle}>Status</Text>

        <View style={styles.statusCard}>
          <TouchableOpacity
            style={styles.closeBtn}
            activeOpacity={0.8}
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : null)}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>✕</Text>
          </TouchableOpacity>

          {loading ? (
            <View style={[styles.tile, { alignItems: 'center' }]}>
              <ActivityIndicator />
            </View>
          ) : !hasData ? (
            <View style={[styles.tile, { alignItems: 'center' }]}>
              <Text style={styles.tileSub}>No records yet.</Text>
            </View>
          ) : (
            <>
              {pageItems.map((it) => {
                const isAppt = it.kind === 'appointment';
                const isGoodMoral = it.kind === 'goodmoral';
                const isIncident = it.kind === 'incident';

                const hasSchedule = (isAppt && (it as any).date) || (!isAppt && (it as any).preferredDate);

                return (
                  <Swipeable
                    key={it.id}
                    renderRightActions={renderRightActions(it)}
                    friction={2}
                    rightThreshold={40}
                    overshootRight={false}
                    onSwipeableRightOpen={() => confirmDelete(it)}
                  >
                    <View style={styles.tile}>
                      <View style={styles.tileHeaderRow}>
                        <View style={styles.leftIcon}>
                          <Text style={styles.iconTxt}>
                          {isAppt ? '🗓️' : isIncident ? '🚨' : '📄'}</Text>
                        </View>

<Text style={styles.tileTitle}>
{isAppt
? capitalize((it as any).purpose || 'Appointment')
: isIncident
? `Incident: ${(it as any).category}`
: it.kind === 'specialpass'
? `Special Pass: ${(it as any).reasonType}`
: `Document: ${(it as any).documentType || 'Good Moral Certificate'}`
}
</Text>
  


                        <View style={styles.rightPill}>
                          <Text style={styles.rightPillText}>Applied: {prettyApplied((it as any).createdAt) || '—'}</Text>
                        </View>
                      </View>

                      <Text style={styles.tileSub}>Office: {capitalize((it as any).office || 'osa')}</Text>

                      {hasSchedule ? (
                        <Text style={styles.tileSub}>
                          Schedule:{' '}
                          {isAppt ? prettyDateTime((it as any).date, (it as any).time) : prettyDate((it as any).preferredDate)}
                        </Text>
                      ) : null}

                     {isGoodMoral && (it as any).purpose && (
  <Text style={styles.tileSub}>
    Purpose: {capitalize((it as any).purpose)}
  </Text>
)}

<View style={styles.statusRow}>
  <View
    style={[
      styles.badge,
      { backgroundColor: statusBadgeColor((it as any).status) },
    ]}
  />
  <Text style={styles.statusText}>
    Status: {capitalize((it as any).status)}
  </Text>
</View>

{it.kind === 'specialpass' && (it as any).status === 'approved' && (
  <>
    <Text style={styles.tileSub}>
      Start Date: {prettyDate((it as any).startDate)}
    </Text>

    <Text style={styles.tileSub}>
      Expiration Date: {prettyDate((it as any).expirationDate)}
    </Text>
  </>
)}
{/* QR PASS FOR APPROVED SPECIAL PASS */}
{it.kind === 'specialpass' && (it as any).status === 'approved' && (
  <View style={{ alignItems: 'center', marginTop: 12 }}>

    <QRCode
      value={`SMARTPASS|${(it as any).id}|APPROVED`}
      size={140}
    />

    <Text style={{ marginTop: 6, fontSize: 11, color: '#334155' }}>
      Show this QR pass to the guard
    </Text>

  </View>
)}
{isIncident && (it as any).sanctionRemarks && (
  <Text style={styles.tileSub}>
    Sanction Remarks: {(it as any).sanctionRemarks}
  </Text>
)}
</View>
</Swipeable>
                );
              })}

              {/* Pagination */}
              <View style={styles.pagerRow}>
                <TouchableOpacity
                  accessibilityLabel="Previous page"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={[styles.pagerIconBtn, page === 0 && styles.pagerIconBtnDisabled]}
                  onPress={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pagerIcon}>‹</Text>
                </TouchableOpacity>

                <Text style={styles.pageIndicator}>Page {page + 1} / {totalPages}</Text>

                <TouchableOpacity
                  accessibilityLabel="Next page"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={[styles.pagerIconBtn, page >= totalPages - 1 && styles.pagerIconBtnDisabled]}
                  onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pagerIcon}>›</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Pretty confirmation modal */}
      <Modal transparent visible={confirmVisible} animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <Text style={styles.confirmTitle}>Delete record?</Text>
            <Text style={styles.confirmMessage}>Are you sure you want to delete this record? This action cannot be undone.</Text>

            <View style={styles.confirmButtons}>
              <TouchableOpacity onPress={() => setConfirmVisible(false)} style={[styles.confirmBtn, { backgroundColor: '#E6E7EA' }]}>
                <Text style={styles.confirmBtnTextDark}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => rowToDelete && performDelete(rowToDelete)}
                style={[styles.confirmBtn, { backgroundColor: '#ef4444' }]}
              >
                <Text style={styles.confirmBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

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
  pagerBtn: {
    backgroundColor: NAVY,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pagerBtnDisabled: { opacity: 0.5 },
  pagerBtnText: { color: '#fff', fontWeight: '700' },
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

  swipeActionWrap: { width: 120, justifyContent: 'center', alignItems: 'center' },
  swipeActionButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#ef4444',
    paddingVertical: 10,
    borderRadius: 8,
  },
  swipeText: { color: '#fff', fontWeight: '800' },

  tileSubSmall: { fontSize: 12, color: '#64748b' },

  // small helpers
  tileSubList: { color: '#475569' },
/* modal */
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  confirmModal: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 6,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtnTextDark: {
    color: '#1e293b',
    fontWeight: '700',
    fontSize: 14,
  },

});