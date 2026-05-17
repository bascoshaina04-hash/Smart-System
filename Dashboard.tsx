import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

const NAVY = '#020120';
const BLUE = '#3C5CE0';
const CARD = '#F2F4F7';
const TEXT_DARK = '#0F172A';

/** pagination config */
const PAGE_SIZE = 10;
const MAX_PAGES = 10; // 10 pages * 10 = 100 rows
/** show only items created in the last N hours */
const RECENT_WINDOW_HOURS = 2;



/* ---------------------- helpers ---------------------- */

// safe timestamp -> string
const formatTs = (ts: any) => {
  try {
    if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
    if (ts instanceof Date) return ts.toLocaleString();
    return String(ts ?? '');
  } catch {
    return String(ts ?? '');
  }
};


/* ---------------------- component ---------------------- */
const Dashboard: React.FC<Props> = ({ navigation }) => {
  const realtimeUnsub = useRef<(() => void) | null>(null);

  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<any>(null);
  const [notificationLoading, setNotificationLoading] = useState(true);
const [specialPass, setSpecialPass] = useState<any>(null);
const [specialPassLoading, setSpecialPassLoading] = useState(true);
  // pagination state
  const [page, setPage] = useState(0);
  const [hasPrev, setHasPrev] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const cursors = useRef<(FirebaseFirestoreTypes.DocumentSnapshot | null)[]>([null]);

  // 2-hour auto refresh
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- map a doc to your row shape (single definition) --
  const mapRow = (doc: FirebaseFirestoreTypes.DocumentSnapshot) => {
    const d = doc.data() as any;
    const dateStr = d?.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString('en-GB') : '';
    return {
      id: doc.id,
      name: d?.studentName || 'Unknown',
      detail: d?.violation || 'Violation',
      date: dateStr,
    };
  };

const mapSpecialPass = (doc: FirebaseFirestoreTypes.DocumentSnapshot) => {

  const d = doc.data() as any;

  const dateStr = d?.createdAt?.toDate
    ? d.createdAt.toDate().toLocaleDateString('en-GB')
    : '';

  const start = d?.startDate?.toDate
    ? d.startDate.toDate().toLocaleDateString('en-GB')
    : '';

  const end = d?.expirationDate?.toDate
    ? d.expirationDate.toDate().toLocaleDateString('en-GB')
    : '';

  return {
    id: doc.id,
    name: d?.studentName || 'Unknown',
    detail: `${d?.course || ''} | ID: ${d?.studentId || ''}`,
    date: dateStr,
    startDate: start,
    expirationDate: end,
  };

};

  // -- map announcement to display shape (coerce createdAt to string) --
  const mapNotification = (doc: FirebaseFirestoreTypes.DocumentSnapshot) => {
    const d = doc.data() as any;
    return {
      id: doc.id,
      title: String(d?.title ?? 'Announcement'),
      date: formatTs(d?.createdAt),
      from: String(d?.from ?? 'Unknown'),
      message: typeof d?.message === 'string' ? d.message : JSON.stringify(d?.message ?? 'No message provided.'),
    };
  };

  // -- Fetch latest notification/announcement for guard dashboard --
  const loadNotification = async () => {
    setNotificationLoading(true);
    try {
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
      const cutoff = firestore.Timestamp.fromDate(cutoffDate);

      const q = firestore()
        .collection('announcements') // adjust collection name if needed
        .where('createdAt', '>=', cutoff)
        .orderBy('createdAt', 'desc')
        .limit(1);

      const snap = await q.get();
      if (!snap.empty) {
        setNotification(mapNotification(snap.docs[0]));
      } else {
        setNotification(null);
      }
    } catch (e: any) {
      console.warn('Notification fetch error:', e);
      setNotification(null);
    } finally {
      setNotificationLoading(false);
    }
  };
const loadSpecialPass = async () => {

  setSpecialPassLoading(true);

  try {

 const snap = await firestore()
  .collection('specialPassRequests')
  .where('status', '==', 'approved')
  .limit(50)
  .get(); 
    if (!snap.empty) {

      const d = snap.docs[0].data();

setSpecialPass({
  name: d.studentName,
  course: d.course,
  studentId: d.studentId,
  date: d.createdAt?.toDate()?.toLocaleString()
});

    } else {
      setSpecialPass(null);
    }

  } catch (e) {

    console.warn("Special pass fetch error:", e);

  } finally {

    setSpecialPassLoading(false);

  }

};
  // -- Fallback when Firestore asks for an index (client-side filter) --
  const loadPageWithoutIndex = async (targetIndex: number) => {
    const cutoff = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000);
    const cutoffMs = cutoff.getTime();

    const BATCH = 50;
    const base = firestore().collection('violations').orderBy('createdAt', 'desc');

    let afterSnap = cursors.current[targetIndex];
    let collected: FirebaseFirestoreTypes.DocumentSnapshot[] = [];
    let lastSnap: FirebaseFirestoreTypes.DocumentSnapshot | null = afterSnap;
    let exhausted = false;
    let safety = 0;

    while (collected.length < PAGE_SIZE + 1 && !exhausted && safety < 10) {
      const q = lastSnap ? base.startAfter(lastSnap).limit(BATCH) : base.limit(BATCH);
      const snap = await q.get();
      if (snap.empty) {
        exhausted = true;
        break;
      }

      const recentOnly = snap.docs.filter(d => {
        const ts = (d.data() as any)?.createdAt;
        const dt = ts?.toDate ? ts.toDate() : null;
        return dt ? dt.getTime() >= cutoffMs : false;
      });

      collected = collected.concat(recentOnly);
      lastSnap = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < BATCH) exhausted = true;
      safety++;
    }

    const canGoNext = collected.length > PAGE_SIZE && targetIndex + 1 < MAX_PAGES;
    const pageDocs = canGoNext ? collected.slice(0, PAGE_SIZE) : collected;

    if (canGoNext) {
      cursors.current[targetIndex + 1] = pageDocs[pageDocs.length - 1];
    } else {
      cursors.current = cursors.current.slice(0, targetIndex + 1);
    }

    setRecent(pageDocs.map(mapRow));
    setHasPrev(targetIndex > 0);
    setHasNext(canGoNext);
    setPage(targetIndex);
  };

  // -- Main loader: server-side 2-hour window (preferred) --
  const loadPage = async (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= MAX_PAGES) return;

    setLoading(true);
    try {
      const cutoffDate = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000);
      const cutoff = firestore.Timestamp.fromDate(cutoffDate);

      const base = firestore()
        .collection('violations')
        .where('createdAt', '>=', cutoff) // only last N hours
        .orderBy('createdAt', 'desc');

      const afterSnap = cursors.current[targetIndex];
      const q = afterSnap ? base.startAfter(afterSnap).limit(PAGE_SIZE + 1) : base.limit(PAGE_SIZE + 1);

      const snap = await q.get();
      const docs = snap.docs;

      const canGoNext = docs.length > PAGE_SIZE && targetIndex + 1 < MAX_PAGES;
      const pageDocs = canGoNext ? docs.slice(0, PAGE_SIZE) : docs;

      if (canGoNext) {
        cursors.current[targetIndex + 1] = pageDocs[pageDocs.length - 1];
      } else {
        cursors.current = cursors.current.slice(0, targetIndex + 1);
      }

      setRecent(pageDocs.map(mapRow));
      setHasPrev(targetIndex > 0);
      setHasNext(canGoNext);
      setPage(targetIndex);
    } catch (e: any) {
      // handle missing index or other firestore errors
      if (e?.code === 'failed-precondition' || /index/i.test(String(e?.message ?? ''))) {
        console.warn('Missing index — using client-side filter.');
        await loadPageWithoutIndex(targetIndex);
      } else {
        console.log('Violations fetch error:', e);
      }
    } finally {
      setLoading(false);
    }
  };
  const listenLatestViolations = () => {
  if (realtimeUnsub.current) {
    realtimeUnsub.current();
    realtimeUnsub.current = null;
  }

  const cutoffDate = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000);
  const cutoff = firestore.Timestamp.fromDate(cutoffDate);

  realtimeUnsub.current = firestore()
    .collection('violations')
    .where('createdAt', '>=', cutoff)
    .orderBy('createdAt', 'desc')
    .limit(PAGE_SIZE)
    .onSnapshot(
      snap => {
        setRecent(snap.docs.map(mapRow));
        setHasPrev(false);
        setHasNext(true);
        setPage(0);
      },
      err => console.warn('Realtime violation listener error:', err)
    );
};
const listenApprovedSpecialPass = () => {

  firestore()
    .collection('specialPassRequests')
    .where('status', '==', 'approved')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .onSnapshot(
      snap => {
        const passes = snap.docs.map(mapSpecialPass);

        setRecent(prev => [...passes, ...prev]);
      },
      err => console.warn('Special pass listener error:', err)
    );
};

  // boot + 2-hour refresh of page 0 and notification
useEffect(() => {
  loadPage(0);
  loadNotification();
  loadSpecialPass();
  listenLatestViolations();
  listenApprovedSpecialPass(); // fetch approved special pass

  if (refreshTimer.current) clearInterval(refreshTimer.current);

  refreshTimer.current = setInterval(() => {
    cursors.current = [null];
    loadPage(0);
    loadNotification();
  }, 2 * 60 * 60 * 1000);

  return () => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    if (realtimeUnsub.current) realtimeUnsub.current();
  };
}, []);

  
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image source={require('./assets/shieldlogo.png')} style={styles.brandLogo} />
          <Text style={styles.brandText}>Smart</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.profileBubble} onPress={() => navigation.navigate('Profile')}>
            <Image source={require('./assets/profileblue.png')} style={styles.profileIconSmall} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Welcome */}
        <Text style={styles.welcome}>Welcome Back!</Text>

        {/* Dynamic Notification/Announcement card for Guard */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Announcements')}
          accessibilityRole="button"
          accessibilityLabel="Open all announcements"
          disabled={notificationLoading}
        >
          <View style={styles.announceCard}>
            {notificationLoading ? (
              <ActivityIndicator size="small" color="#000" style={{ alignSelf: 'center', padding: 20 }} />
            ) : notification ? (
              <View style={styles.announcementContainer}>
                <View style={styles.notificationColumn}>
                  <Image source={require('./assets/notification.png')} style={styles.notificationIcon} />
                </View>

                <View style={styles.detailsColumn}>
                  <View style={styles.row}>
                    <Image source={require('./assets/marketing.png')} style={styles.rowicon} />
                    <Text style={styles.rowtext}>{notification.title}</Text>
                  </View>

                  <Row icon={require('./assets/calendar.png')} text={notification.date} />
                  <Row icon={require('./assets/pin.png')} text={`From: ${notification.from}`} />
                  <Row icon={require('./assets/comment.png')} text={notification.message} multiline />
                </View>
              </View>
            ) : (
              <View style={styles.announcementContainer}>
                <Text style={{ color: '#6b7280', textAlign: 'center', padding: 20 }}>No recent notifications.</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
{/* Special Pass Notification */}
<TouchableOpacity
  style={styles.announceCard}
  onPress={() => navigation.navigate('SpecialPassList')}
>
  <View style={styles.announcementContainer}>

    <View style={styles.notificationColumn}>
      <Image
        source={require('./assets/files.png')}
        style={styles.notificationIcon}
      />
    </View>

    <View style={styles.detailsColumn}>
      <Text style={{fontWeight:'bold', fontSize:16}}>
        View Approved Special Pass
      </Text>

      <Text style={{color:'#6b7280'}}>
        Tap to view all approved passes
      </Text>
    </View>

  </View>
</TouchableOpacity>


        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <ActionButton label="Report" icon={require('./assets/siren.png')} onPress={() => navigation.navigate('ReportForm')} />
          <ActionButton label="History" icon={require('./assets/files.png')} onPress={() => navigation.navigate('History')} />
          <ActionButton label="Profile" icon={require('./assets/profileblue.png')} onPress={() => navigation.navigate('Profile')} />
        </View>

        {/* Recent Violations */}
        <Text style={styles.sectionTitle}>Recent Violations</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#000" style={{ marginVertical: 10 }} />
        ) : (
          <View style={{ gap: 10 }}>
            {recent.length === 0 ? (
              <Text style={{ color: '#6b7280' }}>No recent violations.</Text>
            ) : (
              recent.map((item) => (
                <ViolationItem key={item.id} name={item.name} detail={item.detail} date={item.date} />
              ))
            )}
          </View>
        )}

        {/* Minimal pager */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12 }}>
          <TouchableOpacity onPress={() => loadPage(page - 1)} disabled={!hasPrev} style={{ paddingHorizontal: 12, paddingVertical: 6, opacity: hasPrev ? 1 : 0.35 }}>
            <Text style={{ fontSize: 18, color: TEXT_DARK }}>{'<'}</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 18, color: '#6b7280' }}>Page {page + 1}</Text>

          <TouchableOpacity onPress={() => loadPage(page + 1)} disabled={!hasNext} style={{ paddingHorizontal: 12, paddingVertical: 6, opacity: hasNext ? 1 : 0.35 }}>
            <Text style={{ fontSize: 18, color: TEXT_DARK }}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default Dashboard;

/* ---------------------- small subcomponents ---------------------- */
const Row: React.FC<{ icon: any; text: any; multiline?: boolean }> = ({ icon, text, multiline }) => (
  <View style={styles.row}>
    <Image source={icon} style={styles.rowIcon} />
    <Text style={[styles.rowText, multiline && { lineHeight: 18 }]}>{typeof text === 'string' ? text : String(text)}</Text>
  </View>
);

const ActionButton: React.FC<{ label: string; icon: any; onPress: () => void }> = ({ label, icon, onPress }) => (
  <TouchableOpacity style={styles.actionCard} activeOpacity={0.8} onPress={onPress}>
    <Image source={icon} style={styles.actionIcon} />
    <Text style={styles.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

const ViolationItem: React.FC<{ name: string; detail: string; date: string }> = ({ name, detail, date }) => (
  <View style={styles.violationCard}>
    <Image source={require('./assets/report.png')} style={styles.violationIcon} />
    <View style={{ flex: 1 }}>
      <Text style={styles.violationName}>{name}</Text>
      <Text style={styles.violationDetail}>{detail}</Text>
    </View>
    <View>
      <Text style={styles.dateText}>{date}</Text>
    </View>
  </View>
);


// your original styles untouched
const styles = StyleSheet.create({
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
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  brandLogo: { width: 80, height: 80, resizeMode: 'contain' },
  brandText: {
    fontSize: 45,
    color: '#fff',
    fontFamily: 'Genos-SemiBold',
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  headerRight: { alignItems: 'center', justifyContent: 'center' },
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  welcome: {
    fontSize: 35,
    color: TEXT_DARK,
    fontFamily: 'Genos-SemiBold',
    fontWeight: '500',
    marginBottom: 10,
  },
  announceCard: {
    backgroundColor: '#344CB7',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 15 },
  rowIcon: { width: 25, height: 25, marginTop: 2, marginLeft: 13 },
  rowText: { flex: 1, color: '#fff', fontSize: 15, fontFamily: 'Inter', fontWeight: '500' },
  rowicon: { width: 25, height: 25, resizeMode: 'contain', marginLeft: 13 },
  rowtext: { color: '#fff', fontSize: 15, fontFamily: 'Inter', fontWeight: '600' },
  announcementContainer: { flexDirection: 'row', alignItems: 'flex-start' },
  notificationColumn: { marginRight: 12, justifyContent: 'flex-start' },
  notificationIcon: { width: 40, height: 40, resizeMode: 'contain' },
  detailsColumn: { flex: 1, flexDirection: 'column', gap: 10 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  actionCard: {
    flex: 1,
    backgroundColor: '#ffffffea',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000000ff',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  actionIcon: { width: 63, height: 63, resizeMode: 'contain', marginBottom: 6 },
  actionLabel: { fontSize: 20, color: TEXT_DARK, fontFamily: 'Inter-Regular', fontWeight: '900' },
  sectionTitle: { marginTop: 8, marginBottom: 10, fontSize: 20, color: TEXT_DARK, fontFamily: 'Inter', fontWeight: '900' },
  violationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffffea',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    elevation: 6,
    shadowColor: '#000000ff',
  },
  violationIcon: { width: 45, height: 45, resizeMode: 'contain', marginRight: 10 },
  violationName: { fontSize: 18, color: TEXT_DARK, fontFamily: 'Inter', fontWeight: '700' },
  violationDetail: { fontSize: 15, color: '#475569', fontFamily: 'Inter', fontWeight: '700' },
  dateText: { fontSize: 15, color: '#111827', fontFamily: 'Inter', fontWeight: '600' },

  pager: {
  width: '100%',    
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 12,
},
pagerSide: {
  width: 40,               // equal width keeps center perfectly centered
  alignItems: 'center',
  paddingVertical: 6,
},
pagerArrow: {
  fontSize: 18,
  color: '#0F172A',
},
pagerLabel: {
  flex: 1,
  textAlign: 'center',     // centers the text horizontally
  fontSize: 13,
  color: '#6b7280',
},
});
