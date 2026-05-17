// StudentDashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Modal,
  FlatList,
  Animated,
  Alert,
  StyleSheet,
  Linking, 
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import auth from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore'; 

// Gesture handler: Swipeable + root view
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';

type Props = NativeStackScreenProps<RootStackParamList, 'StudentDashboard'>;

const NAVY = '#020120';
const TILE = '#3C5CE0';
const TEXT_DARK = '#0F172A';

type NotifDoc = {
  id: string;
  title: string;
  body?: string;
  type?: string;
  office?: string;

  reminderType?: string;   // ADD THIS LINE
  recipients?: string[];
  recipientUid?: string;
  studentId?: string;

  readBy?: string[];

  createdAt?: FirebaseFirestoreTypes.Timestamp | null;

  // announcement-only
  attachmentDataUrl?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
};


function getFirstName(name?: string): string {
  if (!name) return 'Student';
  const trimmed = name.trim();
  if (!trimmed) return 'Student';
  if (trimmed.includes(',')) {
    const afterComma = trimmed.split(',')[1]?.trim() || trimmed.split(',')[0].trim();
    return afterComma.split(/\s+/)[0] || 'Student';
  }
  return trimmed.split(/\s+/)[0] || 'Student';
}

function toNotif(doc: FirebaseFirestoreTypes.QueryDocumentSnapshot): NotifDoc {
  const d = doc.data() as any;

  return {
    id: doc.id,
    title: String(d.title || d.type || 'Notification'),
    body: d.body || '',
    type: d.type || 'generic',
    office: d.office || '',
    reminderType: d.reminderType || '',   // ADD THIS

    recipients: Array.isArray(d.recipients)
      ? d.recipients
      : d.recipients
      ? [d.recipients]
      : [],

    recipientUid: d.recipientUid || '',
    studentId: d.studentId || '',
    readBy: Array.isArray(d.readBy) ? d.readBy : [],
    createdAt: d.createdAt || d.updatedAt || null,
  };
}
function announcementToNotif(
  doc: FirebaseFirestoreTypes.QueryDocumentSnapshot
): NotifDoc {
  const d = doc.data() as any;

  return {
    id: `announcement:${doc.id}`,
    title: d.title || 'Announcement',

    // ❌ do NOT show this in list anymore
    body: d.content || '',

    type: 'announcement',
    office: d.postedBy || d.createdByName || 'Administration',

    attachmentDataUrl: d.attachmentDataUrl || null,
    attachmentUrl: d.attachmentUrl || null,
    attachmentName: d.attachmentName || null,

    readBy: Array.isArray(d.readBy) ? d.readBy : [],
    createdAt: d.createdAt || null,
  };
}



const StudentDashboard: React.FC<Props> = ({ navigation, route }) => {
const [displayName, setDisplayName] = useState('Student');
const [selectedAnn, setSelectedAnn] = useState<NotifDoc | null>(null);
const [annOpen, setAnnOpen] = useState(false);
const [selectedNotif, setSelectedNotif] = useState<NotifDoc | null>(null);
const [notifOpen, setNotifOpen] = useState(false);
const [requestMenuOpen, setRequestMenuOpen] = useState(false);
  const firstName = useMemo(() => getFirstName(displayName), [displayName]);

  const uid = auth().currentUser?.uid || '';
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifDoc[]>([]);
  const [unread, setUnread] = useState(0);
const [studentId, setStudentId] = useState('');

  const liveA = useRef<NotifDoc[]>([]) ;
  const liveB = useRef<NotifDoc[]>([]);

  const mergeAndSet = () => {
    const map = new Map<string, NotifDoc>();
    [...liveA.current, ...liveB.current].forEach((n) => map.set(n.id, n));
    const merged = Array.from(map.values()).sort((a, b) => {
      const ta = (a.createdAt?.toDate().getTime() ?? 0);
      const tb = (b.createdAt?.toDate().getTime() ?? 0);
      return tb - ta;
    });
    setNotifs(merged);
    setUnread(merged.filter((n) => !(n.readBy || []).includes(uid)).length);
  };

  useEffect(() => {
  if (!uid || !studentId) return;

 const q1 = firestore()
  .collection('notifications')
  .where('recipientUid', '==', uid);


const q1b = firestore()
  .collection('notifications')
  .where('toStudentId', '==', studentId);
    const unsub1 = q1.onSnapshot(
      (snap) => {
        liveA.current = snap.docs.map((d) => toNotif(d));
        mergeAndSet();
      },
      (err) => {
        console.log('notifications q1 error', err);
        liveA.current = [];
        mergeAndSet();
      }
    );

    const q2 = firestore()
      .collection('notifications')
      .where('recipients', 'array-contains-any', [uid, 'students', 'all-students', 'all']);

    const unsub2 = q2.onSnapshot(
      (snap) => {
        liveB.current = snap.docs.map((d) => toNotif(d));
        mergeAndSet();
      },
      (err) => {
        console.log('notifications q2 error', err);
        liveB.current = [];
        mergeAndSet();
      }
    );
const unsub1b = q1b.onSnapshot(
  (snap) => {
    const mapped = snap.docs.map((d) => toNotif(d));
    liveA.current = [...liveA.current, ...mapped];
    mergeAndSet();
  },
  (err) => {
    console.log('notifications q1b error', err);
  }
);
    const annQuery = firestore()
      .collection('announcements')
      .orderBy('createdAt', 'desc')
      .limit(50);

    const unsub3 = annQuery.onSnapshot(
      (snap) => {
        try {
          const anns = snap.docs
            .map((d) => {
              const mapped = announcementToNotif(d);
              const v = (d.data()?.visibility || '').toString().toLowerCase();
              if (!v) return mapped;
              if (v.includes('student') || v.includes('all') || /year/.test(v)) return mapped;
              return null;
            })
            .filter(Boolean) as NotifDoc[];

          const otherB = liveB.current.filter(n => !n.id.startsWith('announcement:'));
          liveB.current = [...otherB, ...anns];
          mergeAndSet();
        } catch (e) {
          console.log('announcements mapping error', e);
        }
      },
      (err) => {
        console.log('announcements listener error', err);
      }
    );

  return () => {
  unsub1();
  unsub1b();
  unsub2();
  unsub3();
};
}, [uid, studentId]);
useEffect(() => {
  if (!uid) return;

  const unsub = firestore()
    .collection('students')
    .doc(uid)
    .onSnapshot(
      (doc) => {
if (doc.exists()) {
  const data = doc.data() as any;
  setDisplayName(data?.name || 'Student');
  setStudentId(data?.studentID || '');
}
      },
      (err) => {
        console.log('student name fetch error', err);
      }
    );

  return () => unsub();
}, [uid, studentId]);

  useEffect(() => {
    if (!open || !uid) return;
    const toMark = notifs.filter((n) => !(n.readBy || []).includes(uid));
    if (toMark.length === 0) return;

    const batch = firestore().batch();
    toMark.forEach((n) => {
      if (!n.id.startsWith('announcement:')) {
        const ref = firestore().collection('notifications').doc(n.id);
        batch.update(ref, { readBy: firestore.FieldValue.arrayUnion(uid) });
      }
    });
    batch.commit().catch((e) => console.log('mark read error', e));
  }, [open, notifs, uid]);

  const openModal = () => setOpen(true);
  const closeModal = () => setOpen(false);

  const markAsRead = async (n: NotifDoc) => {
    const already = (n.readBy || []).includes(uid);
    if (already) return;
    if (n.id.startsWith('announcement:')) {
      const newNotifs = notifs.map(x => (x.id === n.id ? { ...x, readBy: [...(x.readBy||[]), uid] } : x));
      setNotifs(newNotifs);
      setUnread(newNotifs.filter((i) => !(i.readBy||[]).includes(uid)).length);
      return;
    }

    try {
      await firestore().collection('notifications').doc(n.id).update({
        readBy: firestore.FieldValue.arrayUnion(uid),
      });
      const newNotifs = notifs.map(x => (x.id === n.id ? { ...x, readBy: [...(x.readBy||[]), uid] } : x));
      setNotifs(newNotifs);
      setUnread(newNotifs.filter((i) => !(i.readBy||[]).includes(uid)).length);
    } catch (e) {
      console.log('markAsRead error', e);
      Alert.alert('Error', 'Could not mark notification as read.');
    }
  };

  const deleteNotif = async (n: NotifDoc) => {
    if (n.id.startsWith('announcement:')) {
      const filtered = notifs.filter(x => x.id !== n.id);
      setNotifs(filtered);
      setUnread(filtered.filter((i) => !(i.readBy||[]).includes(uid)).length);
      return;
    }

    try {
      await firestore().collection('notifications').doc(n.id).delete();
      const filtered = notifs.filter(x => x.id !== n.id);
      setNotifs(filtered);
      setUnread(filtered.filter((i) => !(i.readBy||[]).includes(uid)).length);
    } catch (e) {
      console.log('deleteNotif error', e);
      Alert.alert('Error', 'Could not delete notification.');
    }
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    item: NotifDoc
  ) => {
    return (
      <View style={{ width: 150, flexDirection: 'row' }}>
        <View style={[styles.swipeAction, { backgroundColor: '#10b981' }]}>
          <Text style={styles.swipeText}>Mark Read</Text>
        </View>
        <View style={[styles.swipeAction, { backgroundColor: '#ef4444' }]}>
          <Text style={styles.swipeText}>Delete</Text>
        </View>
      </View>
    );
  };

const renderNotif = ({ item }: { item: NotifDoc }) => {
  const isUnread = !(item.readBy || []).includes(uid);

  return (
    <Swipeable
      renderRightActions={(progress, dragX) =>
        renderRightActions(progress as any, dragX as any, item)
      }
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      onSwipeableRightOpen={() => {
        deleteNotif(item);
      }}
    >
  <TouchableOpacity
  activeOpacity={0.85}
  onPress={() => {

  if (item.type === 'announcement') {
    setSelectedAnn(item);
    setAnnOpen(true);
    return;
  }

  // show notification body popup
  setSelectedNotif(item);
  setNotifOpen(true);

}}
>
        <View style={styles.notifRow}>
          <View
            style={[
              styles.notifBadge,
              { backgroundColor: isUnread ? '#f59e0b' : '#94a3b8' },
            ]}
          />

          <View style={{ flex: 1 }}>
            {/* ✅ TITLE ONLY */}
            <Text style={styles.notifTitle}>
              {item.title || 'Notification'}
            </Text>

            {/* ✅ WHO POSTED */}
            {item.type === 'announcement' && !!item.office && (
              <Text style={styles.notifFrom}>
                From: {item.office}
              </Text>
            )}

            {/* ❌ BODY NOT SHOWN HERE */}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};



  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image source={require('./assets/shieldlogo.png')} style={styles.brandLogo} />
          <Text style={styles.brandText}>Smart</Text>
        </View>

        <TouchableOpacity style={styles.profileBubble} onPress={() => navigation.navigate('Profile')}>
          <Image source={require('./assets/profileblue.png')} style={styles.profileIconSmall} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.greetRow}>
          <Text style={styles.hello}>Hello, {firstName}!</Text>

          <TouchableOpacity onPress={openModal} activeOpacity={0.8} style={{ padding: 4 }}>
            <Image source={require('./assets/bell.png')} style={styles.bell} />
            {unread > 0 && (
              <View style={styles.badgeWrap}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          <Tile label="Profile" icon={require('./assets/avatar.png')} onPress={() => navigation.navigate('Profile')} />
          <Tile label="Appointments" icon={require('./assets/calendarstudent.png')} onPress={() => navigation.navigate('StudentAppointments')} />
<TouchableOpacity
  style={styles.tile}
  onPress={() => setRequestMenuOpen(true)}
  activeOpacity={0.85}
>
  <Image
    source={require('./assets/docs.png')}
    style={{ width: 35, height: 35, resizeMode: 'contain' }}
  />
  <Text style={styles.tileLabel}>Request Docs</Text>
</TouchableOpacity>
          <Tile label="Violations" icon={require('./assets/warning.png')} onPress={() => navigation.navigate('StudentViolations')} />
          <Tile label="Status" icon={require('./assets/home.png')} onPress={() => navigation.navigate('StudentStatus')} />
          <Tile label="Incident" icon={require('./assets/incident-report.png')} onPress={() => navigation.navigate('StudentConsultation')} />
        </View>
      </ScrollView>
<Modal
  visible={annOpen}
  animationType="slide"
  onRequestClose={() => setAnnOpen(false)}
>
  <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F7FB' }}>

    {/* Header */}
    <View style={styles.annHeader}>
      <View style={{ flex: 1 }}>

        {/* Announcement title */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image
            source={require('./assets/announcement.png')}
            style={{ width: 30, height: 30, marginRight: 8 }}
            resizeMode="contain"
          />
          <Text style={styles.annTitle}>
            {selectedAnn?.title}
          </Text>
        </View>

        {/* Posted by */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 6,
          }}
        >
          <Image
            source={require('./assets/user2.png')}
            style={{ width: 30, height: 30, marginRight: 6 }}
            resizeMode="contain"
          />
          <Text style={styles.annFrom}>
            {selectedAnn?.office}
          </Text>
        </View>
      </View>

      {/* Close button */}
      <TouchableOpacity
        onPress={() => setAnnOpen(false)}
        style={styles.annCloseIcon}
      >
        <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>
          ✕
        </Text>
      </TouchableOpacity>
    </View>

    <ScrollView contentContainerStyle={{ padding: 16 }}>

      {/* Content Card */}
      <View style={styles.annCard}>
        {!!selectedAnn?.body && (
          <Text style={styles.annBody}>
            {selectedAnn.body}
          </Text>
        )}

        {/* Image attachment */}
        {selectedAnn?.attachmentDataUrl && (
          <Image
            source={{ uri: selectedAnn.attachmentDataUrl }}
            style={styles.annImage}
          />
        )}

        {/* File / link attachment */}
        {selectedAnn?.attachmentUrl && (
          <TouchableOpacity
            style={styles.annAttachmentBtn}
            onPress={() => Linking.openURL(selectedAnn.attachmentUrl!)}
            activeOpacity={0.85}
          >
            <Image
              source={require('./assets/ppclip.png')}
              style={{ width: 18, height: 18, marginRight: 8 }}
              resizeMode="contain"
            />
            <Text style={styles.annAttachmentText}>
              {selectedAnn.attachmentName || 'View Attachment'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

    </ScrollView>
  </SafeAreaView>
</Modal>

{/* Request Docs Dropdown */}
<Modal
  transparent
  visible={requestMenuOpen}
  animationType="fade"
  onRequestClose={() => setRequestMenuOpen(false)}
>
  <TouchableOpacity
    style={styles.modalBackdrop}
    activeOpacity={1}
    onPress={() => setRequestMenuOpen(false)}
  >
    <TouchableOpacity
      activeOpacity={1}
      style={styles.modalCard}
      onPress={(e) => e.stopPropagation()}
    >

      <Text style={styles.modalTitle}>Select Request</Text>

    <TouchableOpacity
  style={styles.optRow}
  onPress={() => {
    setRequestMenuOpen(false);
    navigation.navigate('StudentRequestDocs');
  }}
>
  <Text style={styles.optText}>Good Moral Certificate</Text>
</TouchableOpacity>

<TouchableOpacity
  style={styles.optRow}
  onPress={() => {
    setRequestMenuOpen(false);
    navigation.navigate('StudentSpecialPass');
  }}
>
  <Text style={styles.optText}>Request for Special Pass</Text>
</TouchableOpacity>
    </TouchableOpacity>
  </TouchableOpacity>
</Modal>

      {/* Notifications Modal */}
      <Modal transparent visible={open} animationType="fade" onRequestClose={closeModal}>
        {/* use a View backdrop (not TouchableOpacity) so gestures reach Swipeable */}
        <View style={styles.modalBackdrop}>
          {/* Ensure Swipeable works inside modal */}
          <GestureHandlerRootView style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Notifications</Text>
                <TouchableOpacity onPress={closeModal} style={styles.modalCloseBtn}>
                  <Text style={{ color: '#fff', fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              {notifs.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#475569' }}>No notifications yet.</Text>
                </View>
              ) : (
                <FlatList
                  data={notifs}
                  keyExtractor={(i) => i.id}
                  renderItem={renderNotif}
                  ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                  contentContainerStyle={{ paddingVertical: 8 }}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                />
              )}
            </View>
          </GestureHandlerRootView>
        </View>
      </Modal>
      <Modal
  visible={notifOpen}
  animationType="fade"
  transparent
  onRequestClose={() => setNotifOpen(false)}
>
  <View style={{
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)'
  }}>

    <View style={{
      width: '85%',
      backgroundColor: '#111827',
      padding: 20,
      borderRadius: 15
    }}>

      <Text style={{
        fontSize: 18,
        fontWeight: 'bold',
        color: '#facc15',
        marginBottom: 10
      }}>
        {selectedNotif?.title}
      </Text>

      <Text style={{
        color: '#fff',
        fontSize: 15,
        lineHeight: 22
      }}>
        {selectedNotif?.body}
      </Text>

      <TouchableOpacity
        style={{
          marginTop: 20,
          backgroundColor: '#3C5CE0',
          padding: 10,
          borderRadius: 8,
          alignItems: 'center'
        }}
        onPress={() => setNotifOpen(false)}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Close</Text>
      </TouchableOpacity>

    </View>

  </View>
</Modal>
    </SafeAreaView>
  );
};

export default StudentDashboard;


/* small component kept as-is */
function Tile({ label, icon, onPress }: { label: string; icon: any; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.85}>
      <Image source={icon} style={{ width: 35, height: 35, resizeMode: 'contain' }} />
      <Text style={styles.tileLabel}>{label}</Text>
    </TouchableOpacity>
  )
}


/* --- styles --- */
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
  brandLogo: { width: 80, height: 80, resizeMode: 'contain' },
  brandText: {
    fontSize: 45,
    color: '#fff',
    fontFamily: 'Genos-SemiBold',
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  profileBubble: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  profileIconSmall: { width: 18, height: 18, resizeMode: 'contain', tintColor: '#fff' },

  greetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  hello: { fontSize: 33, fontFamily: 'Genos-SemiBold', fontWeight: '500', color: '#0F172A' },
  bell: { width: 45, height: 45, resizeMode: 'contain' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,   // ⬅️ add space left & right
    rowGap: 3,              // ⬅️ vertical gap (RN 0.71+)
  },

  tile: {
    width: 150,          // 🔑 two per row
    marginBottom: 16,      // spacing between rows
    backgroundColor: '#344CB7',
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  tileIcon: {
    width: 50,
    height: 50,
    shadowColor: '#000',
    resizeMode: 'contain',
    elevation: 10,
  },

  tileLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  
  /* modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: TEXT_DARK, flex: 1 },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF4D4F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  

  notifRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
  },
  notifBadge: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  notifTitle: { fontWeight: '900', color: '#0f172a' },
  notifBody: { color: '#334155', marginTop: 2 },
  notifTime: { color: '#64748b', marginTop: 6, fontSize: 12 },
  badgeWrap: {
    position: 'absolute',
    right: -4,
    top: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  swipeAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  swipeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  
notifFrom: {
  fontSize: 12,
  color: '#475569',
  marginTop: 2,
  marginBottom: 4,
  fontStyle: 'italic',
},
annHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 16,
  backgroundColor: '#020120',
 
},

annTitle: {
  fontSize: 20,
  fontWeight: '500',
  color: '#fff',
  fontFamily: 'Genos-SemiBold',
},

annFrom: {
  fontSize: 15,
  color: '#E5E7EB',
},

annCloseIcon: {
  backgroundColor: '#EF4444',
  width: 30,
  height: 30,
  borderRadius: 18,
  alignItems: 'center',
  justifyContent: 'center',
},

annCard: {
  backgroundColor: '#FFFFFF',
  borderRadius: 18,
  padding: 18,

  // depth
  shadowColor: '#020120',
  shadowOpacity: 0.1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,

  // spacing
  marginBottom: 20,

  // subtle outline (helps on light backgrounds)
  borderWidth: 1,
  borderColor: '#E6E8F0',
},


annBody: {
  fontSize: 15,
  lineHeight: 22,
  color: '#0F172A',
  textAlign: 'justify',
},

annImage: {
  width: '100%',
  height: 220,
  resizeMode: 'contain',
  marginTop: 16,
  borderRadius: 12,
},

annAttachmentBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 16,
  padding: 12,
  backgroundColor: '#EEF2FF',
  borderRadius: 12,
},

annAttachmentText: {
  fontSize: 14,
  color: '#1D4ED8',
  fontWeight: '600',
},
optRow: {
  paddingVertical: 14,
  borderBottomWidth: 1,
  borderBottomColor: '#E5E7EB',
},

optText: {
  fontSize: 16,
  textAlign: 'center',
  color: '#0F172A',
  fontWeight: '600',
},
});

  