// FacultyReportForm.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import storage from '@react-native-firebase/storage';
import { launchImageLibrary } from 'react-native-image-picker';

type Props = NativeStackScreenProps<any, any>;

const NAVY = '#020120';
const ORANGE = '#FCB316';
const CARD_BG = '#0B0D3B';
const INPUT_BG = '#E6E7EB';

export const VIOLATION_CATEGORIES = ['Academic', 'Grave', 'Less Grave', 'Light'] as const;
export type VCat = (typeof VIOLATION_CATEGORIES)[number];

export const VIOLATION_OPTIONS: Record<VCat, string[]> = {
  Academic: [
    'Plagiarism',
    'Taking a test for another student',
    'Altering grades/test papers',
    'Copying answers in exams',
    'Allowing others to copy',
    'Leaking exam questions/answers',
    'Writing a report/assignment for another student',
    'Other analogous academic offenses',
  ],
  Grave: [
    'Bringing/using prohibited drugs on campus',
    'Vandalism causing serious property damage',
    'Sexual assault',
    'Hazing causing harm or humiliation',
    'Possession of firearms/explosives/deadly weapons',
    'Defacing or removing library books',
    'Theft',
    'Forgery/tampering with official documents',
    'Physical assault/injury',
    'Extortion',
    'Defamatory/libelous remarks',
    'Other grave offense',
  ],
  'Less Grave': [
    'Verbal abuse / threats / cyberbullying',
    'Stalking on campus',
    'Indecent or immoral acts',
    'Under the influence of liquor on campus',
    'Bringing alcoholic drinks to campus',
    'Bringing pornographic materials',
    'Threats of violence to coerce others',
    'Gambling on campus',
    'Littering',
    'Other less grave offense',
  ],
  Light: [
    'Dress code violation',
    'Unauthorized use of facilities',
    'Minor disruption in class/campus activities',
    'Smoking in restricted areas',
    'Other light offense',
  ],
};

/* ─────────── Reusable dropdown ─────────── */
const CustomSelect = ({
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
}: {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={[styles.inputWrap, disabled && { opacity: 0.5 }]}
        activeOpacity={disabled ? 1 : 0.9}
        onPress={() => !disabled && setOpen(true)}
      >
        <Text style={[styles.input, { color: value ? '#0F172A' : '#7A7F87', textAlignVertical: 'center' }]}>
          {value || placeholder}
        </Text>
        <Image source={require('./assets/chevron-down.png')} style={styles.trailingIcon} />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPressOut={() => setOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select</Text>
            {options.map((opt, i) => (
              <TouchableOpacity
                key={opt}
                onPress={() => { onChange(opt); setOpen(false); }}
                style={{ paddingVertical: 10 }}
              >
                <Text style={{ color: '#0F172A', fontWeight: opt === value ? '700' : '500', textAlign: 'center', width: '100%' }}>
                  {opt}
                </Text>
                {i < options.length - 1 ? <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 }} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

/* ─────────── Student picker ─────────── */
type Student = { docId: string; studentID: string; name: string; [k: string]: any };

const normalizeStudentID = (d: any, docId: string): string => {
  const candidates = [d?.studentID, d?.studentId, d?.uid, d?.student_ID, d?.studentNo, d?.id, d?.ID];
  let val = candidates.find(v => (typeof v === 'string' && v.trim().length > 0) || typeof v === 'number');
  let out = val != null ? String(val).trim() : '';
  if (!out && typeof d?.email === 'string') {
    const at = d.email.indexOf('@');
    if (at > 0) out = d.email.slice(0, at).trim();
  }
  return out || docId;
};

const StudentSelect = (props: {
  selectedLabel: string;
  onPick: (s: Student) => void;
}) => {
  const { selectedLabel, onPick } = props;
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [pickerDebug, setPickerDebug] = useState('');

  useEffect(() => {
    const unsub = firestore()
      .collection('students')
      .orderBy('name')
      .limit(200)
      .onSnapshot(
        (snap) => {
          const data: Student[] = [];
          snap.forEach((doc) => {
            const d = doc.data() as any;
            const studentID = normalizeStudentID(d, doc.id);
            const nameFromField = d?.name ?? d?.fullName ?? d?.studentName;
            const name = String(nameFromField ?? '').trim();
            if (studentID && name) data.push({ docId: doc.id, studentID, name, ...d });
          });
          setStudents(data);
          setLoading(false);
        },
        (err: unknown) => {
          const e = err as any;
          const msg = e?.code ? `${e.code}: ${e.message ?? ''}`.trim() : e?.message ?? String(err);
          console.log('[StudentSelect] load error', err);
          setPickerDebug(msg);
          setLoading(false);
          Alert.alert('Error', 'Failed to load students.');
        },
      );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return students;
    return students.filter(
      (x) =>
        x.studentID?.toString().toLowerCase().includes(s) ||
        x.name?.toLowerCase().includes(s) ||
        (x.course?.toLowerCase?.().includes(s) ?? false),
    );
  }, [q, students]);

  return (
    <>
      <TouchableOpacity style={styles.inputWrap} activeOpacity={0.9} onPress={() => setOpen(true)}>
        <Text style={[styles.input, { color: selectedLabel ? '#0F172A' : '#7A7F87' }]}>
          {selectedLabel || 'Select Student (by ID)'}
        </Text>
        <Image source={require('./assets/chevron-down.png')} style={styles.trailingIcon} />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPressOut={() => setOpen(false)}>
          <View style={[styles.modalCard, { maxHeight: '75%' }]}>
            <Text style={styles.modalTitle}>Select Student</Text>

            <View style={[styles.inputWrap, { marginBottom: 10 }]}>
              <TextInput
                style={styles.input}
                placeholder="Search by ID, name, or course"
                placeholderTextColor="#7A7F87"
                value={q}
                onChangeText={setQ}
                autoCapitalize="none"
              />
              <Image source={require('./assets/search.png')} style={styles.trailingIcon} />
            </View>

            {loading ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator />
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ color: '#475569' }}>No students found.</Text>
                {!!pickerDebug && (
                  <Text style={{ marginTop: 6, color: '#94A3B8', fontSize: 11 }}>{pickerDebug}</Text>
                )}
              </View>
            ) : (
              filtered.map((s, i) => (
                <TouchableOpacity
                  key={`${s.docId}-${i}`}
                  onPress={() => { onPick(s); setOpen(false); }}
                  style={{ paddingVertical: 10 }}
                >
                  <Text style={{ fontWeight: '700', color: '#0F172A', textAlign: 'center' }}>
                    {s.studentID} — {s.name}
                  </Text>
                  {i < filtered.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 }} />
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

/* ─────────── Form screen ─────────── */
const FacultyReportForm: React.FC<Props> = ({ navigation }) => {
  // selected student (picker only)
  const [studentDocId, setStudentDocId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');

  const [comment, setComment] = useState('');

  const [category, setCategory] = useState<VCat | ''>('');
  const [selectedViolation, setSelectedViolation] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // evidence upload states (new)
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceName, setEvidenceName] = useState('');
  const [evidenceBase64, setEvidenceBase64] = useState<string | null>(null);

  const onPickFile = async () => {
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
        setUploadingFile(false);
        setUploadProgress(null);
        Alert.alert('No image', 'No image selected.');
        return;
      }

      const fileName = asset.fileName || `evidence_${Date.now()}.jpg`;
      setEvidenceName(fileName);

      // Try Storage first (if configured). If it fails, fallback to base64.
      try {
        if (asset.base64) {
          const path = `evidence/${Date.now()}_${fileName}`;
          const ref = storage().ref(path);
          const task = ref.putString(asset.base64, 'base64', { contentType: asset.type || 'image/jpeg' });
          task.on('state_changed', snapshot => {
            const pct = Math.round((snapshot.bytesTransferred / (snapshot.totalBytes || 1)) * 100);
            setUploadProgress(pct);
          });
          await task;
          const url = await ref.getDownloadURL();
          setEvidenceUrl(url);
          setEvidenceBase64(null);
          Alert.alert('Uploaded', 'Evidence uploaded to Storage.');
        } else {
          let uploadUri = asset.uri;
          if (uploadUri.startsWith('file://')) uploadUri = uploadUri.replace('file://', '');
          const path = `evidence/${Date.now()}_${fileName}`;
          const ref = storage().ref(path);
          const task = ref.putFile(uploadUri);
          task.on('state_changed', snapshot => {
            const pct = Math.round((snapshot.bytesTransferred / (snapshot.totalBytes || 1)) * 100);
            setUploadProgress(pct);
          });
          await task;
          const url = await ref.getDownloadURL();
          setEvidenceUrl(url);
          setEvidenceBase64(null);
          Alert.alert('Uploaded', 'Evidence uploaded to Storage.');
        }
      } catch (storageErr) {
        console.warn('[Storage upload failed] falling back:', storageErr);
        if (asset.base64) {
          setEvidenceBase64(asset.base64);
          setEvidenceUrl('');
          Alert.alert('Notice', 'Storage not available — image will be saved inside the report (base64).');
        } else {
          setEvidenceBase64(null);
          setEvidenceUrl('');
          Alert.alert('Upload failed', 'Could not upload to Storage and no base64 available. Enable Storage or select another image.');
        }
      }
    } catch (err: any) {
      console.warn('[Pick/upload error]', err);
      Alert.alert('Error', err?.message || String(err));
    } finally {
      setUploadingFile(false);
      setUploadProgress(null);
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const sid = (studentId || '').trim();
    const sdoc = (studentDocId || '').trim();
    const sname = (studentName || '').trim();
    const cat = category;
    const vtext = (selectedViolation || '').trim();

    // Require picker selection (no manual ID)
    if (!sdoc || !sid || !sname || !cat || !vtext) {
      setSubmitting(false);
      Alert.alert('Missing info', 'Please pick a student from the selector, choose Category and Violation.');
      return;
    }

    try {
      const authUid = auth().currentUser?.uid;
      if (!authUid) {
        setSubmitting(false);
        Alert.alert('Not signed in', 'Please login again.');
        return;
      }

      const payload: any = {
        studentUid: sdoc,
        student_uid: sdoc, // legacy
        studentID: sid,
        studentId: sid,
        studentName: sname,
        category: cat,
        violation: vtext,
        type: vtext, // legacy compatibility
        comment: (comment || '').trim(),
        status: 'open',
        createdByUid: authUid,           // required by your rules
        createdByRole: 'faculty',        // tag as faculty
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      };

      if (evidenceUrl) {
        payload.evidenceUrl = evidenceUrl;
        payload.evidenceName = evidenceName || '';
      } else if (evidenceBase64) {
        // WARNING: Document size limit applies
        payload.evidenceBase64 = evidenceBase64;
        payload.evidenceName = evidenceName || '';
      }

      // 1) Main write
      const vioRef = await firestore().collection('violations').add(payload);

      // 2) Mirror write under student (best-effort)
      try {
        await firestore()
          .collection('students')
          .doc(sdoc)
          .collection('violations')
          .doc(vioRef.id)
          .set(payload);
      } catch (mirrorErr) {
        console.warn('[Mirror write failed]', mirrorErr);
      }

      // 3) Optional notification (best-effort)
      try {
        await firestore().collection('notifications').add({
          type: 'violation_created',
          toStudentId: sid,
          title: 'New Violation',
          body: `${vtext}${comment ? ` — ${comment}` : ''}`,
          violationId: vioRef.id,
          createdAt: firestore.FieldValue.serverTimestamp(),
          read: false,
        });
      } catch (notifyErr) {
        console.warn('[Notification add failed]', notifyErr);
      }

      // Reset UI
      setStudentDocId('');
      setStudentId('');
      setStudentName('');
      setCategory('');
      setSelectedViolation('');
      setComment('');
      setEvidenceUrl('');
      setEvidenceBase64(null);
      setEvidenceName('');
      setShowSuccess(true);
    } catch (e: any) {
      console.error('[FACULTY SUBMIT ERROR]', e);
      const code = e?.code || '';
      let msg = 'Failed to record violation.';
      if (code === 'permission-denied') msg = 'You do not have permission to create violations.';
      if (code === 'unavailable') msg = 'Network unavailable. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image source={require('./assets/shieldlogo.png')} style={styles.logo} />
          <Text style={styles.brandText}>Smart</Text>
        </View>
        <TouchableOpacity
          style={styles.profileBubble}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Image source={require('./assets/profileblue.png')} style={styles.profileIcon} />
        </TouchableOpacity>
      </View>

      {/* Form */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Faculty Violation Form</Text>

          {/* Student picker (picker only) */}
          <StudentSelect
            selectedLabel={studentId || ''}
            onPick={(s) => {
              setStudentDocId(s.docId);
              setStudentId(s.studentID);
              setStudentName(s.name);
            }}
          />

          {/* Read-only name */}
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Student Name"
              placeholderTextColor="#7A7F87"
              value={studentName}
              editable={false}
            />
          </View>

          {/* Category */}
          <CustomSelect
            placeholder="Select Category"
            value={category}
            options={VIOLATION_CATEGORIES as unknown as string[]}
            onChange={(v) => { setCategory(v as VCat); setSelectedViolation(''); }}
          />

          {/* Violation (depends on category) */}
          <CustomSelect
            placeholder={category ? 'Select Violation' : 'Select Category first'}
            value={selectedViolation}
            options={category ? VIOLATION_OPTIONS[category] : []}
            onChange={setSelectedViolation}
            disabled={!category}
          />

          {/* File picker */}
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Select File"
              placeholderTextColor="#7A7F87"
              editable={false}
              value={evidenceName}
            />
            <TouchableOpacity onPress={onPickFile} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {uploadingFile ? <ActivityIndicator /> : <Image source={require('./assets/ppclip.png')} style={styles.trailingIcon} />}
            </TouchableOpacity>
          </View>

          {/* Upload progress (if any) */}
          {uploadProgress != null && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
              <Text style={{ color: '#94A3B8', fontSize: 12 }}>Uploading: {uploadProgress}%</Text>
            </View>
          )}

          {/* Comment */}
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Comment"
              placeholderTextColor="#7A7F87"
              value={comment}
              onChangeText={setComment}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={onSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: 'center', marginTop: 8 }}>
            <Text style={{ color: '#98A2B3', fontWeight: '500' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Success modal */}
      <Modal visible={showSuccess} transparent animationType="fade" onRequestClose={() => setShowSuccess(false)}>
        <View style={styles.successBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Violation recorded</Text>
            <Text style={styles.modalBody}>Saved to the “violations” collection.</Text>
            <Pressable style={styles.modalBtn} onPress={() => setShowSuccess(false)}>
              <Text style={styles.modalBtnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default FacultyReportForm;


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F5F7' },

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
  brandText: { fontSize: 45, color: '#fff', fontFamily: 'Genos-SemiBold', fontWeight: '400', letterSpacing: 0.5 },
  profileBubble: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  profileIcon: { width: 18, height: 18, tintColor: '#fff', resizeMode: 'contain' },

  scroll: { padding: 16 },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginTop: 50,
    alignSelf: 'center',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 30,
    fontFamily: 'Genos-SemiBold',
    fontWeight: '400',
    alignSelf: 'center',
    marginBottom: 28,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    marginBottom: 15,
    marginHorizontal: 16,
  },

  input: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15,
    fontFamily: 'Inter',
    fontWeight: '600',
  },
  trailingIcon: {
    width: 25,
    height: 25,
    tintColor: '#64748B',
    resizeMode: 'contain',
    marginLeft: 8,
  },

  submitBtn: {
    backgroundColor: ORANGE,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginHorizontal: 16,
  },
  submitText: { color: '#111827', fontSize: 18, fontFamily: 'Inter', fontWeight: '700' },

  /* Dropdown / Modal shared */
  dropdownBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-start', alignItems: 'center', paddingTop: 120 },
  successBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '80%', backgroundColor: 'white', borderRadius: 12, padding: 18, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  modalBody: { fontSize: 14, color: '#374151', marginBottom: 12 },
  modalBtn: { alignSelf: 'flex-end', backgroundColor: ORANGE, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  modalBtnText: { color: '#111827', fontWeight: '700' },
});
