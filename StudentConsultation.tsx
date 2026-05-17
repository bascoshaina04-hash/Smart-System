// StudentIncident.tsx
import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';



type Props = NativeStackScreenProps<RootStackParamList, 'StudentConsultation'>;

const NAVY = '#020120';
const INPUT_BG = '#FFFFFF';
const ORANGE = '#FCB316';
const PLACEHOLDER = '#7A7F87';
const TEXT_DARK = '#0F172A';

type Attachment = {
  uri: string;
  name?: string;
  type?: string;
  size?: number;
  base64?: string; // ✅ ADD THIS
};
const INCIDENT_TYPES = ['Bullying', 'Harassment', 'Threats/Coercion', 'Other'] as const;
type IncidentType = (typeof INCIDENT_TYPES)[number];

/* ----------------- helpers ----------------- */

// Same idea as used in your other screens: resolve current student
const resolveCurrentStudent = async (): Promise<{ studentID: string; studentName: string } | null> => {
  const raw = await AsyncStorage.getItem('currentUser');
  let parsed: { role: 'student' | 'guard' | 'admin'; id: string } | null = raw ? JSON.parse(raw) : null;

  if (!parsed) {
    const rememberId = await AsyncStorage.getItem('rememberId');
    if (rememberId) parsed = { role: 'student', id: rememberId };
  }

  if (!parsed || parsed.role !== 'student' || !parsed.id) return null;

  const idCandidate = String(parsed.id).trim();
  const ID_FIELDS = ['studentID', 'student_id', 'studentNumber', 'idNumber', 'id', 'sid'];

  const tryIdQuery = async (value: any) => {
    for (const f of ID_FIELDS) {
      const snap = await firestore().collection('students').where(f, '==', value).limit(1).get();
      if (!snap.empty) return snap.docs[0].data() as any;
    }
    return null;
  };

  let d: any = await tryIdQuery(idCandidate);
  if (!d && /^[0-9]+$/.test(idCandidate)) d = await tryIdQuery(Number(idCandidate));
  if (!d) return null;

  const title = (s: string) =>
    s
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1))
      .join(' ');

  const rawName =
    (d.fullName as string) ||
    [d.firstName, d.lastName].filter(Boolean).join(' ') ||
    (d.name as string) ||
    '';

  const studentName =
    rawName && !/^student$/i.test(rawName.trim())
      ? title(rawName)
      : title(((d.email as string) || '').split('@')[0] || '');

  const studentID = String(
    d.studentID ?? d.student_id ?? d.studentNumber ?? d.idNumber ?? d.id ?? d.sid ?? idCandidate
  );

  return { studentID, studentName };
};

/* Small select */
const CustomSelect = ({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const display = value || placeholder;

  return (
    <>
      <TouchableOpacity activeOpacity={0.9} onPress={() => setOpen(true)} style={styles.inputWrap}>
        <Text
          style={{
            textAlign: 'center',
            fontSize: 15,
            fontWeight: '600',
            color: value ? TEXT_DARK : PLACEHOLDER,
          }}
        >
          {display}
        </Text>
        <Image
          source={require('./assets/chevron-down.png')}
          style={{ position: 'absolute', right: 1, width: 40, height: 40, tintColor: '#1f2937' }}
        />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPressOut={() => setOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select</Text>
            <View style={styles.modalDivider} />
            {options.map((opt, idx) => (
              <React.Fragment key={`${opt}-${idx}`}>
                <TouchableOpacity
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  activeOpacity={0.9}
                  style={styles.optRow}
                >
                  <Text style={[styles.optText, opt === value && styles.optTextSelected]}>{opt}</Text>
                  {opt === value ? <Text style={styles.optTick}>✓</Text> : null}
                </TouchableOpacity>
                {idx < options.length - 1 ? <View style={styles.modalSeparator} /> : null}
              </React.Fragment>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

/* ----------------- Screen ----------------- */
export default function StudentAppointments({ navigation }: Props) {
  const [incidentType, setIncidentType] = useState<IncidentType | ''>('');
  const [dateStr, setDateStr] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode] = useState<'date'>('date');

  const [tempDate, setTempDate] = useState<Date>(new Date());

const onSubmit = async () => {
  if (submitting) return;

  if (!incidentType || !details.trim()) {
    Alert.alert('Missing info', 'Please select a type and describe the incident.');
    return;
  }

  setSubmitting(true);

  try {
    const who = await resolveCurrentStudent();
    if (!who) throw new Error('Student not found');

    const evidences = attachments.map(a => ({
      name: a.name,
      type: a.type,
      base64: a.base64,
    }));

    await firestore().collection('incidentReports').add({
      office: 'osa',
      kind: incidentType,
      location: location.trim(),
      occurredDate: dateStr.trim(),
      details: details.trim(),
      studentID: who.studentID,
      studentName: who.studentName,

      evidences,
      evidenceCount: evidences.length,

      status: 'submitted',
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    Alert.alert('Submitted', 'Your incident report has been sent to OSA.');

    setIncidentType('');
    setDateStr('');
    setLocation('');
    setDetails('');
    setAttachments([]);
  } catch (e: any) {
    Alert.alert('Error', e?.message ?? 'Failed to submit report.');
  } finally {
    setSubmitting(false);
  }
};



 /* --- evidence picking --- */
const openEvidencePicker = async () => {
  let ImagePicker: any;
  try {
    ImagePicker = require('react-native-image-picker');
  } catch {
    ImagePicker = null;
  }

  const choose = async (mode: 'camera' | 'gallery') => {
    if (mode === 'camera') {
      if (!ImagePicker?.launchCamera) {
        return Alert.alert(
          'Add camera support',
          'To take a photo, install react-native-image-picker.'
        );
      }
const res = await ImagePicker.launchCamera({
  mediaType: 'photo',
  selectionLimit: 1,
  includeBase64: true, // ✅ ADD
  quality: 0.6,        // ✅ compress (VERY IMPORTANT)
});


      if (res?.assets?.length) {
        const pick = res.assets.map((a: any, idx: number) => ({
          uri: a.uri,
          name: a.fileName ?? `photo_${Date.now()}_${idx}.jpg`,
          type: a.type ?? 'image/jpeg',
          size: a.fileSize,
        })) as Attachment[];

        setAttachments(prev => [...prev, ...pick]);
      }
      return;
    }

    if (mode === 'gallery') {
      if (!ImagePicker?.launchImageLibrary) {
        return Alert.alert(
          'Add gallery support',
          'To pick from gallery, install react-native-image-picker.'
        );
      }

const res = await ImagePicker.launchImageLibrary({
  mediaType: 'photo',  // ✅ image only
  selectionLimit: 1,   // ⚠️ LIMIT TO 1 IMAGE (Firestore limit)
  includeBase64: true, // ✅ ADD
  quality: 0.6,
});


const pick = res.assets.map((a: any, idx: number) => ({
  uri: a.uri,
  name: a.fileName ?? `photo_${Date.now()}_${idx}.jpg`,
  type: a.type ?? 'image/jpeg',
  size: a.fileSize,
  base64: a.base64, // ✅ REQUIRED
})) as Attachment[];

setAttachments(prev => [...prev, ...pick]);



      return;
    }
  };

  Alert.alert(
    'Add evidence',
    'Choose a source',
    [
      { text: 'Camera', onPress: () => choose('camera') },
      { text: 'Gallery', onPress: () => choose('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ],
    { cancelable: true }
  );
};


  const onChangeDate = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate) {
      setShowPicker(false);
      return;
    }

    setTempDate(selectedDate);

    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');

    setDateStr(`${yyyy}-${mm}-${dd}`);
    setShowPicker(false);
  };

  const attachmentsCount = useMemo(() => attachments.length, [attachments]);

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
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', marginTop: -1 }}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.title}>OSA INCIDENT REPORT</Text>

          <CustomSelect
            placeholder="Select Incident Type"
            value={incidentType}
            options={INCIDENT_TYPES as unknown as string[]}
            onChange={v => setIncidentType(v as IncidentType)}
          />

          <TouchableOpacity style={styles.inputWrap} activeOpacity={0.9} onPress={() => setShowPicker(true)}>
            <TextInput
              style={[styles.input, { textAlign: 'center' }]}
              placeholder="Date of Incident (YYYY-MM-DD)"
              placeholderTextColor={PLACEHOLDER}
              value={dateStr}
              editable={false}
              pointerEvents="none"
            />
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { textAlign: 'center' }]}
              placeholder="Location (e.g., Building A, hallway)"
              placeholderTextColor={PLACEHOLDER}
              value={location}
              onChangeText={setLocation}
            />
          </View>

          <View style={[styles.inputWrap, { height: 100, alignItems: 'stretch', paddingVertical: 8 }]}>
            <TextInput
              style={[styles.input, { textAlign: 'left', flex: 1 }]}
              placeholder="Describe what happened"
              placeholderTextColor={PLACEHOLDER}
              value={details}
              onChangeText={setDetails}
              multiline
            />
          </View>

          <TouchableOpacity style={styles.inputWrap} activeOpacity={0.9} onPress={openEvidencePicker}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 15,
                fontWeight: '600',
                color: attachmentsCount ? TEXT_DARK : PLACEHOLDER,
              }}
            >
              {attachmentsCount
                ? `${attachmentsCount} attachment${attachmentsCount > 1 ? 's' : ''}`
                : 'Evidences (optional): Attach'}
            </Text>
            <Image source={require('./assets/ppclip.png')} style={styles.trailingIcon} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bookBtn, submitting && { opacity: 0.6 }]}
            onPress={onSubmit}
            disabled={submitting}
          >
            <Text style={styles.bookText}>{submitting ? 'Submitting…' : 'Submit Report'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: 'center', marginTop: 8 }}>
            <Text style={{ color: '#98A2B3', fontWeight: '500' }}>Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {showPicker && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onChangeDate}
        />
      )}
    </SafeAreaView>
  );
}


/* ----------------- styles (header + red close button exactly as requested) ----------------- */
const styles = StyleSheet.create({
  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#1FA2FF',
  },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  brandLogo: { width: 80, height: 80, resizeMode: 'contain' },
  brandText: {
    fontSize: 45,
    color: '#fff',
    fontFamily: 'Genos-SemiBold',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  profileBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIconSmall: { width: 18, height: 18, resizeMode: 'contain', tintColor: '#fff' },

  /* Card */
  card: {
    backgroundColor: '#040340',
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 18,
    marginTop: 24,
    marginHorizontal: 20,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  /* Red close circle */
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

  title: {
    alignSelf: 'center',
 
    color: '#fff',
    fontWeight: '500',
    fontSize: 30,
    marginBottom: 14,
    fontFamily: 'Genos-SemiBold',
    letterSpacing: 0.4,
  },

  inputWrap: {
    backgroundColor: INPUT_BG,
    borderRadius: 8,
    height: 50,
    marginBottom: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  input: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  trailingIcon: {
    position: 'absolute',
    right: 8,
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },

  bookBtn: {
    backgroundColor: ORANGE,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  bookText: { color: '#111827', fontWeight: '800', fontSize: 16 },

  /* modal (used by select) */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  modalDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  modalSeparator: { height: 1, backgroundColor: '#E5E7EB' },

  optRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  optText: { fontSize: 16, fontWeight: '600', color: '#1F2937', textAlign: 'center' },
  optTextSelected: { fontWeight: '800', color: TEXT_DARK },
  optTick: { marginLeft: 8, fontSize: 16, color: TEXT_DARK },
});
