// StudentViolations.tsx
import React, { useEffect, useRef, useState } from 'react';
import storage from '@react-native-firebase/storage';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
    Modal,     
  TextInput,   
  Alert,  
  RefreshControl,
} from 'react-native';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NAVY = '#020120';
const CARD_BLUE = '#192352ff';
const TEXT = '#0F172A';
const PILL_RESOLVED = '#10B981';

type VDoc = {
  id: string;
  studentID?: string;
  studentName?: string;
  category?: string;
  violation?: string;
  comment?: string;
  status?: string;
  sanction?: string; // ✅ ADD THIS
  createdAt?: FirebaseFirestoreTypes.Timestamp | null;
};

export default function StudentViolations({ navigation }: any) {
  const [studentID, setStudentID] = useState<string>('');
  const [items, setItems] = useState<VDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [debug, setDebug] = useState<string>('');
  const [sanctionOpen, setSanctionOpen] = useState(false);
const [selectedViolation, setSelectedViolation] = useState<VDoc | null>(null);
const [proofText, setProofText] = useState('');
const [proofImage, setProofImage] = useState<string | null>(null);
const [uploadingFile, setUploadingFile] = useState(false);
const [uploadProgress, setUploadProgress] = useState<number | null>(null);
const [proofImageUrl, setProofImageUrl] = useState('');
const [proofImageBase64, setProofImageBase64] = useState<string | null>(null);
const [proofImageName, setProofImageName] = useState('');
const [submittedMap, setSubmittedMap] = useState<Record<string, boolean>>({});


  // keep a merged map so two listeners (by studentID and by studentUid) won't duplicate rows
  const mapRef = useRef<Map<string, VDoc>>(new Map());
const onPickProofFile = async () => {
  try {
    setUploadingFile(true);
    setUploadProgress(0);

    const res = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.6,
      selectionLimit: 1,
      includeBase64: true,
      maxWidth: 1280,
      maxHeight: 1280,
    });

    if (res.didCancel) {
      setUploadingFile(false);
      setUploadProgress(null);
      return;
    }

    const asset = res.assets?.[0];
    if (!asset || !asset.uri) {
      throw new Error('No image selected');
    }

    const fileName = asset.fileName || `compliance_${Date.now()}.jpg`;
    setProofImageName(fileName);

    try {
      // ✅ Storage first (same as ReportForm)
      if (asset.base64) {
        const path = `compliance/${Date.now()}_${fileName}`;
        const ref = storage().ref(path);

        const task = ref.putString(asset.base64, 'base64', {
          contentType: asset.type || 'image/jpeg',
        });

        task.on('state_changed', snap => {
          const pct = Math.round(
            (snap.bytesTransferred / (snap.totalBytes || 1)) * 100,
          );
          setUploadProgress(pct);
        });

        await task;
        const url = await ref.getDownloadURL();

        setProofImageUrl(url);
        setProofImageBase64(null);
        Alert.alert('Uploaded', 'Proof uploaded successfully.');
      }
    } catch (storageErr) {
      // 🔁 Fallback to base64 (same logic)
      console.warn('[Storage failed]', storageErr);
      if (asset.base64) {
        setProofImageBase64(asset.base64);
        setProofImageUrl('');
        Alert.alert(
          'Notice',
          'Storage unavailable. Image will be saved inside the record.',
        );
      } else {
        throw new Error('Upload failed');
      }
    }
  } catch (err: any) {
    Alert.alert('Error', err.message || 'Failed to attach proof.');
  } finally {
    setUploadingFile(false);
    setUploadProgress(null);
  }
};
useEffect(() => {
  (async () => {
    try {
      const uid = await AsyncStorage.getItem('currentUid');
      if (!uid) return;

      const snap = await firestore()
        .collection('violation_compliance')
        .where('studentUid', '==', uid)
        .get();

      const map: Record<string, boolean> = {};
      snap.forEach(doc => {
        const d = doc.data();
        if (d.violationId) {
          map[d.violationId] = true;
        }
      });

      setSubmittedMap(map);
    } catch (e) {
      console.warn('Failed to load compliance map', e);
    }
  })();
}, []);
  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    (async () => {
      setLoading(true);
      setDebug('Reading keys…');

      const sid = (await AsyncStorage.getItem('currentStudentID')) || '';
      const uid = (await AsyncStorage.getItem('currentUid')) || ''; // auth UID saved at login

      if (!sid && !uid) {
        setDebug('No studentID/AuthUID found in storage.');
        setLoading(false);
        return;
      }

      setStudentID(sid || '(no studentID)');

      const STATUS_KEYS = ['status', 'verdict', 'decision', 'state'];

      const applySnap = (snap: FirebaseFirestoreTypes.QuerySnapshot) => {
        const map = mapRef.current;
        snap.forEach((d) => {
          const x = d.data() as any;

          // prefer whichever status-like field is actually populated
          const rawStatus =
            STATUS_KEYS.map((k) => (x?.[k] ?? ''))
              .find((v) => String(v).trim().length > 0) ?? '';
              

          map.set(d.id, {
            id: d.id,
            studentID: x.studentID,
            studentName: x.studentName,
            category: x.category,
            violation: x.violation,
            comment: x.comment,
            status: String(rawStatus),
            createdAt: x.createdAt ?? null,
             sanction: x.sanction || '',
          });
        });

        const merged = Array.from(map.values()).sort(
          (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
        );

        if (!cancelled) {
          setItems(merged);
          setLoading(false);
          setDebug(`Loaded ${merged.length} record(s).`);
        }
      };

      // 1) Listen by studentID (legacy)
      if (sid) {
        const q1 = firestore().collection('violations').where('studentID', '==', sid);
        unsubs.push(
          q1.onSnapshot(
            (s) => applySnap(s),
            (e) => {
              if (!cancelled) {
                setDebug(`studentID query error: ${e?.message || e}`);
                setLoading(false);
              }
            },
          ),
        );
      }

      // 2) Listen by studentUid (auth id)
      if (uid) {
        const q2 = firestore().collection('violations').where('studentUid', '==', uid);
        unsubs.push(
          q2.onSnapshot(
            (s) => applySnap(s),
            (e) => {
              if (!cancelled) {
                setDebug(`studentUid query error: ${e?.message || e}`);
                setLoading(false);
              }
            },
          ),
        );
      }

      if (unsubs.length === 0) setLoading(false);
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    // onSnapshot is real-time; just stop the spinner shortly
    setTimeout(() => setRefreshing(false), 400);
  };

  const fmtDate = (ts?: FirebaseFirestoreTypes.Timestamp | null) => {
    if (!ts) return '';
    const d = ts.toDate();
    return d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
  };

  // normalize whatever staff saved to the 3 labels you want to show
const normStatus = (s?: string) => {
  const v = String(s || '').trim().toLowerCase();

  if (['resolved', 'resolve', 'approved', 'approve', 'closed', 'done'].includes(v)) {
    return 'Resolved';
  }

  if (['escalated', 'escalate', 'urgent', 'for escalation'].includes(v)) {
    return 'Escalated';
  }

  if (['ongoing', 'in progress', 'processing'].includes(v)) {
    return 'Ongoing';
  }

  if (['rejected', 'denied', 'dismissed'].includes(v)) {
    return 'Rejected';
  }

  return 'Pending';
};


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image source={require('./assets/shieldlogo.png')} style={styles.brandLogo} />
          <Text style={styles.brandText}>Smart</Text>
        </View>
        <TouchableOpacity activeOpacity={0.8} style={styles.profileBubble}>
          <Image source={require('./assets/profileblue.png')} style={styles.profileIconSmall} />
        </TouchableOpacity>
      </View>
      <View style={styles.backCircleWrap}>
        <TouchableOpacity
          style={styles.backCircleBtn}
          activeOpacity={0.8}
          onPress={() => {
            if (navigation?.canGoBack && navigation.canGoBack()) navigation.goBack();
            else navigation?.navigate?.('Dashboard');
          }}
        >
          <Image source={require('./assets/left-arrow.png')} style={styles.backCircleIcon} />
        </TouchableOpacity>
      </View>
<Modal
  visible={sanctionOpen}
  transparent
  animationType="fade"
  onRequestClose={() => setSanctionOpen(false)}
>
  {/* Dark backdrop */}
  <View style={styles.modalBackdrop}>

    {/* Card */}
    <View style={styles.modalCard}>

      {/* Header */}
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Submit Compliance</Text>
        <TouchableOpacity onPress={() => setSanctionOpen(false)}>
          <Text style={styles.modalClose}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        <Text style={styles.formLabel}>Violation</Text>
        <Text style={styles.formValue}>
          {selectedViolation?.violation}
        </Text>

        <Text style={styles.formLabel}>Sanction</Text>
        <Text style={styles.formValue}>
          {selectedViolation?.sanction}
        </Text>

        <Text style={styles.formLabel}>Your Explanation</Text>
        <TextInput
          multiline
          placeholder="Explain how you complied…"
          value={proofText}
          onChangeText={setProofText}
          style={styles.textAreaInput}
        />

<TouchableOpacity
  style={styles.attachBtn}
  onPress={onPickProofFile}
  disabled={uploadingFile}
>
  {uploadingFile ? (
    <ActivityIndicator />
  ) : (
    <Text style={styles.attachText}>📎 Attach Proof</Text>
  )}
  {proofImageName ? (
  <Text
    style={{
      marginTop: 6,
      fontSize: 12,
      color: '#475569',
      textAlign: 'center',
    }}
  >
    Attached: {proofImageName}
  </Text>
) : null}
</TouchableOpacity>



        <TouchableOpacity
          style={styles.submitBtn}
onPress={async () => {
  if (!proofText.trim()) {
    Alert.alert('Required', 'Please explain how you complied.');
    return;
  }

  if (!selectedViolation) return;

  try {
    const uid = await AsyncStorage.getItem('currentUid');
    const sid = await AsyncStorage.getItem('currentStudentID');

const payload: any = {
  violationId: selectedViolation.id,
  studentUid: uid,
  studentID: sid,
  explanation: proofText,
  status: 'pending_review',
  submittedAt: firestore.FieldValue.serverTimestamp(),
};

if (proofImageUrl) {
  payload.proofImageUrl = proofImageUrl;
  payload.proofImageName = proofImageName;
} else if (proofImageBase64) {
  payload.proofImageBase64 = proofImageBase64;
  payload.proofImageName = proofImageName;
}
const existing = await firestore()
  .collection('violation_compliance')
  .where('violationId', '==', selectedViolation.id)
  .where('studentUid', '==', uid)
  .limit(1)
  .get();

if (!existing.empty) {
  Alert.alert(
    'Already Submitted',
    'You have already submitted compliance for this sanction.'
  );
  return;
}

await firestore().collection('violation_compliance').add(payload);

    Alert.alert(
      'Submitted',
      'Your compliance has been sent to OSA for review.'
    );
  

setSubmittedMap(prev => ({
  ...prev,
  [selectedViolation.id]: true,
}));

Alert.alert(
  'Submitted',
  'Your compliance has been sent to OSA for review.'
);


    setSanctionOpen(false);
    setProofText('');
    setProofImage(null);
  } catch (e) {
    console.error('Compliance submit error:', e);
    Alert.alert('Error', 'Failed to submit compliance.');
  }
  setProofText('');
setProofImageUrl('');
setProofImageBase64(null);
setProofImageName('');
}}
>
  
          <Text style={styles.submitBtnText}>Submit</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  </View>
</Modal>


      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#475569' }}>Loading violations…</Text>
          {!!debug && (
            <Text
              style={{
                marginTop: 6,
                color: '#94A3B8',
                fontSize: 11,
                textAlign: 'center',
                paddingHorizontal: 16,
              }}
            >
              {debug}
            </Text>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>Violations</Text>

          {items.length === 0 ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <Text style={{ color: '#475569' }}>No violations found.</Text>
              {!!debug && (
                <Text style={{ marginTop: 6, color: '#94A3B8', fontSize: 11, textAlign: 'center' }}>
                  {debug}
                </Text>
              )}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
             {items.map((v) => {
  const st = normStatus(v.status);
  const alreadySubmitted = submittedMap[v.id] === true;
             
  return (
    <View key={v.id} style={styles.card}>
             
  {/* STATUS BADGE (TOP RIGHT) */}
  <View
    style={[
      styles.statusBadge,
      st === 'Resolved'
        ? styles.pillResolved
        : st === 'Escalated'
        ? styles.pillEscalated
        : st === 'Ongoing'
        ? styles.pillOngoing
        : st === 'Rejected'
        ? styles.pillRejected
        : styles.pillPending,
    ]}
  >
    <Text style={styles.statusBadgeText}>{st}</Text>
  </View>

  {/* CONTENT */}
  <View style={{ flex: 1 }}>
    <Text style={styles.cardTitle}>{v.violation || 'Violation'}</Text>
    <Text style={styles.cardSub}>{fmtDate(v.createdAt)}</Text>
    <Text style={styles.cardNote}>{v.comment || '—'}</Text>

    {/* SANCTION */}
{st === 'Ongoing' && !!v.sanction && (
  <View style={styles.sanctionBox}>
    <Text style={styles.sanctionLabel}>Sanction</Text>
    <Text style={styles.sanctionText}>{v.sanction}</Text>



<TouchableOpacity
  style={[
    styles.sanctionBtn,
    alreadySubmitted && { backgroundColor: '#94A3B8' }, // gray
  ]}
  activeOpacity={alreadySubmitted ? 1 : 0.85}
  disabled={alreadySubmitted}
  onPress={() => {
    if (alreadySubmitted) {
      Alert.alert(
        'Already Submitted',
        'You have already submitted compliance for this sanction.'
      );
      return;
    }
    setSelectedViolation(v);
    setSanctionOpen(true);
  }}
>
  <Text style={styles.sanctionBtnText}>
    {alreadySubmitted ? 'Compliance Submitted' : 'Submit Compliance'}
  </Text>
</TouchableOpacity>

  </View>
)}
  </View>
</View>

);
 })}
</View>
            
)}
</ScrollView>
)}
</SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: NAVY,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: '#1FA2FF',
  },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  brandLogo: { width: 70, height: 70, resizeMode: 'contain' },
  brandText: { fontSize: 38, color: '#fff', fontFamily: 'Genos-SemiBold', fontWeight: '400', letterSpacing: 0.5 },
  profileBubble: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  profileIconSmall: { width: 18, height: 18, tintColor: '#fff', resizeMode: 'contain' },

  pageTitle: { color: TEXT, fontSize: 35, fontWeight: '500', marginVertical: 12, fontFamily: 'Genos-SemiBold', marginLeft:70, },

  card: {
    backgroundColor: CARD_BLUE, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 6, shadowColor: '#000',
    shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  cardSub: { color: '#E6EBFF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  cardNote: { color: '#E6EBFF', fontSize: 14, marginTop: 2 },

  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, alignSelf: 'center' },
    pillPending: { backgroundColor: CARD_BLUE },
  pillResolved: { backgroundColor: PILL_RESOLVED },
  // NEW: Escalated style (red)
  pillEscalated: { backgroundColor: '#EF4444' },

  pillText: { fontSize: 12, fontWeight: '700' },
  pillTextLight: { color: '#fff' },
  pillTextDark: { color: '#052e1a' },

  
  backCircleWrap: {
  paddingHorizontal: 16,
  paddingTop: 10,
  marginBottom: -68, // more space under the arrow
  zIndex: 20
},


backCircleBtn: {
  width: 35,
  height: 35,
  borderRadius: 21,
  backgroundColor: '#E5E7EB', // Light gray (change if needed)
  justifyContent: 'center',
  alignItems: 'center',
  marginTop:20,
  marginLeft:9,
},

backCircleIcon: {
  width: 18,
  height: 18,
  tintColor: '#0F172A', // dark navy
},
pillOngoing: {
  backgroundColor: '#F59E0B', // amber
},
pillRejected: {
  backgroundColor: '#EF4444', // red
},
sanctionLabel: {
  fontSize: 17,
  fontWeight: '700',
  color: '#771c1cff',
  marginBottom: 2,
},

sanctionText: {
  fontSize: 17,
  color: '#e93939ff',
  backgroundColor: '#FEF3C7',
  padding: 8,
  borderRadius: 8,
},
sanctionBox: {
  marginTop: 10,
  backgroundColor: '#FEF3C7', // soft yellow
  borderLeftWidth: 5,
  borderLeftColor: '#F59E0B',
  padding: 10,
  borderRadius: 8,
},

statusBadge: {
  position: 'absolute',
  top: 48,
  right: 12,
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 20,
  zIndex: 10,
},

statusBadgeText: {
  fontSize: 12,
  fontWeight: '700',
  color: '#fff',
},
sanctionBtn: {
  marginTop: 10,
  backgroundColor: '#18181aff',
  paddingVertical: 8,
  borderRadius: 8,
  alignItems: 'center',
},

sanctionBtnText: {
  color: '#fff',
  fontWeight: '700',
  fontSize: 13,
},

formHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 16,
  borderBottomWidth: 1,
  borderBottomColor: '#E5E7EB',
},

formTitle: {
  fontSize: 18,
  fontWeight: '700',
},

formLabel: {
  fontSize: 13,
  fontWeight: '700',
  color: '#475569',
  marginTop: 16,
},

formValue: {
  fontSize: 14,
  marginTop: 4,
  color: '#0b1220ff',
},

textArea: {
  marginTop: 6,
  backgroundColor: '#fff',
  borderRadius: 10,
  padding: 12,
  borderWidth: 1,
  borderColor: '#E5E7EB',
},

attachBtn: {
  marginTop: 14,
  padding: 12,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '#CBD5E1',
  alignItems: 'center',
},

attachText: {
  color: '#141414ff',
  fontWeight: '600',
},

submitBtn: {
  marginTop: 20,
  backgroundColor: '#fdb827',
  paddingVertical: 14,
  borderRadius: 10,
  alignItems: 'center',
},

submitBtnText: {
  color: '#111111ff',
  fontWeight: '700',
  fontSize: 15,
},
modalBackdrop: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.45)',
  justifyContent: 'center',
  alignItems: 'center',
},

modalCard: {
  width: '90%',
  maxHeight: '80%',
  backgroundColor: '#fff',
  borderRadius: 18,
  padding: 16,
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 12,
  elevation: 8,
},

modalHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
},

modalTitle: {
  fontSize: 30,
  fontWeight: '500',
fontFamily: 'Genos-SemiBold',
  color: '#020120',
  letterSpacing:1,
},

modalClose: {
  fontSize: 18,
  fontWeight: '700',
  color: '#64748B',
},

textAreaInput: {
  backgroundColor: '#F1F5F9',
  borderRadius: 10,
  padding: 12,
  minHeight: 90,
  textAlignVertical: 'top',
  marginBottom: 12,
},


}); 
