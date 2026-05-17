// StudentRequestDocs.tsx
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';

import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar, DateData } from 'react-native-calendars';

type Props = NativeStackScreenProps<RootStackParamList, 'StudentRequestDocs'>;

/* ----------------- theme ----------------- */
const NAVY = '#020120';
const CARD_BG = '#0B0D3B';
const INPUT_BG = '#FFFFFF';
const PLACEHOLDER = '#7A7F87';
const TEXT_DARK = '#0F172A';
const ORANGE = '#FCB316';
const GREEN = '#16a34a';

/* ----------------- data constants ----------------- */
const COLLECTION = 'goodMoralRequest';
const DOC_TYPES = ['Good Moral Certificate'];
const RELEASE_MODES = ['Pick-up'];

/* ----------------- helpers ----------------- */
const docExists = (snap: any): boolean =>
  typeof snap?.exists === 'function' ? snap.exists() : !!snap?.exists;

const titleCase = (s?: string) =>
  (s || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

const buildStudentName = (d: any, authUser?: any): string => {
  const full =
    (d?.fullName as string) ||
    [d?.firstName, d?.lastName].filter(Boolean).join(' ').trim();
  if (full) return titleCase(full);

  const nameField = (d?.name as string) || '';
  if (nameField && !/^student$/i.test(nameField.trim())) return titleCase(nameField);

  const fromAuth = authUser?.displayName || '';
  if (fromAuth) return titleCase(fromAuth);

  const email = ((authUser?.email as string) || '').toLowerCase();
  const local = (email.split('@')[0] || '').trim();
  if (local) return titleCase(local.replace(/[._-]+/g, ' '));

  return 'Student';
};

const buildCourseSection = (d: any, savedCourse?: string): string => {
  const combo =
    d?.courseSection ??
    d?.course_section ??
    d?.courseYearSection ??
    d?.courseYrSec ??
    '';
  if (combo) return String(combo);

  const course = String(
    d?.course ?? d?.program ?? d?.degree ?? savedCourse ?? ''
  ).trim();
  const section = String(
    d?.section ??
      d?.yearSection ??
      d?.year_section ??
      d?.yrSec ??
      d?.year ??
      d?.block ??
      ''
  ).trim();

  if (course && section) return `${course} ${section}`;
  if (course) return course;
  return section || '';
};

const prettyDate = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
};

/* ----------------- availability loader (same approach as StudentAppointments) ----------------- */
const loadAvailableDays = async (whichOffice: string) => {
  // mirrors StudentAppointments loadAvailableDays: scan top-level availability docs
  const marks: Record<string, any> = {};
  try {
    const snap = await firestore().collection('availability').get();
    snap.forEach((doc) => {
      const id = doc.id; // example: "2025-12-15__osa" or "2025-12-15__guidance"
      const data = doc.data() as any;

      const [dateStr, officeStr] = id.split('__');

      // only consider docs that have both parts
      if (!dateStr || !officeStr) return;

      if (officeStr.toLowerCase() !== whichOffice.toLowerCase()) return;

      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        marks[dateStr] = {
          marked: true,
          dotColor: GREEN,
          selectedColor: GREEN,
          selected: false,
        };
      }
    });

    return marks;
  } catch (e) {
    console.error('loadAvailableDays error:', e);
    throw e;
  }
};

/* ----------------- fetch slots for a specific OSA date (like StudentAppointments) ----------------- */
const fetchSlotsForDay = async (isoDate: string) => {
  // try document id pattern "YYYY-MM-DD__osa" under top-level /availability
  try {
    const docId = `${isoDate}__osa`;
    const snap = await firestore().collection('availability').doc(docId).get();
    if (docExists(snap)) {
      const d = snap.data() as any;
      // common shapes:
      // { slots: ['08:00','08:20', ...] }
      if (Array.isArray(d.slots)) return d.slots;
      // { times: [...] }
      if (Array.isArray(d.times)) return d.times;
      // { caps: { '08:00': 5, '08:20': 5, ... } } -> return sorted keys
      if (d?.caps && typeof d.caps === 'object') {
        return Object.keys(d.caps).sort();
      }
      return [];
    }

    // fallback: office-specific path offices/osa/availability/{isoDate}
    const officeDoc = await firestore()
      .collection('offices')
      .doc('osa')
      .collection('availability')
      .doc(isoDate)
      .get();
    if (docExists(officeDoc)) {
      const d = officeDoc.data() as any;
      if (Array.isArray(d.slots)) return d.slots;
      if (Array.isArray(d.times)) return d.times;
      if (d?.caps && typeof d.caps === 'object') return Object.keys(d.caps).sort();
      return [];
    }

    // another fallback: availability/{isoDate} (exact date doc without suffix)
    const topDoc = await firestore().collection('availability').doc(isoDate).get();
    if (docExists(topDoc)) {
      const d = topDoc.data() as any;
      if (Array.isArray(d.slots)) return d.slots;
      if (Array.isArray(d.times)) return d.times;
      if (d?.caps && typeof d.caps === 'object') return Object.keys(d.caps).sort();
    }

    // nothing found
    return [];
  } catch (e) {
    console.error('fetchSlotsForDay error:', e);
    throw e;
  }
};

/* ----------------- student resolver ----------------- */
const resolveCurrentStudent = async () => {
  const authUser = auth().currentUser;
  const raw = await AsyncStorage.getItem('currentUser');
  const parsed: any = raw ? JSON.parse(raw) : null;

  const savedStudentID = (await AsyncStorage.getItem('currentStudentID')) || '';
  const savedCourse = (await AsyncStorage.getItem('currentStudentCourse')) || '';

  const emailLocal = ((authUser?.email || '').split('@')[0] || '').trim();

  const candidateIds = [
    savedStudentID,
    String(parsed?.id || ''),
    String(parsed?.uid || ''),
    emailLocal,
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const FIELDS = [
    'studentID',
    'student_id',
    'studentNumber',
    'idNumber',
    'sid',
    'uid',
    'id',
    'ID',
  ];

  let found: any = null;

  for (const cid of candidateIds) {
    const snap = await firestore().collection('students').doc(cid).get();
    if (docExists(snap)) {
      found = snap.data();
      break;
    }
  }

  if (!found) {
    outer: for (const cid of candidateIds) {
      const asNum = Number(cid);
      for (const f of FIELDS) {
        let qs = await firestore()
          .collection('students')
          .where(f, '==', cid)
          .limit(1)
          .get();
        if (!qs.empty) {
          found = qs.docs[0].data();
          break outer;
        }
        if (!isNaN(asNum) && isFinite(asNum)) {
          qs = await firestore()
            .collection('students')
            .where(f, '==', asNum)
            .limit(1)
            .get();
          if (!qs.empty) {
            found = qs.docs[0].data();
            break outer;
          }
        }
      }
    }
  }

  const studentID =
    found?.studentID ??
    found?.student_id ??
    found?.studentNumber ??
    found?.idNumber ??
    found?.sid ??
    found?.uid ??
    found?.id ??
    found?.ID ??
    candidateIds[0] ??
    '';

  return {
    studentID: String(studentID).trim(),
    studentName: buildStudentName(found || {}, authUser),
    course: found?.course ?? found?.program ?? found?.degree ?? savedCourse ?? '',
    courseSection: buildCourseSection(found || {}, savedCourse),
  };
};

/* ----------------- screen ----------------- */
const StudentRequestDocs: React.FC<Props> = ({ navigation }) => {
  const [docType] = useState('Good Moral Certificate');
  const [purpose, setPurpose] = useState('');
  const [releaseMode] = useState('Pick-up');

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [dateISO, setDateISO] = useState<string>('');

  // slots/time
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [timeStr, setTimeStr] = useState<string>('');

  const [fullName, setFullName] = useState('');
  const [courseSection, setCourseSection] = useState('');
  const [studentId, setStudentId] = useState('');

  const [requestedBy, setRequestedBy] = useState('');
  const [relation, setRelation] = useState('');
  const [note, setNote] = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const who = await resolveCurrentStudent();
        setFullName(who.studentName || '');
        setStudentId((who.studentID || '').toString());
        setCourseSection(who.courseSection || who.course || '');
      } catch (e) {
        Alert.alert(
          'Profile not found',
          'We could not load your student profile. You may still submit, just confirm your details.'
        );
      }
    })();
  }, []);

  const onOpenCalendar = async () => {
    try {
      setLoadingAvailability(true);
      setCalendarOpen(true);
      const marks = await loadAvailableDays('OSA'); // same behavior as StudentAppointments
      // normalize to ensure Calendar sees dot info
      const normalized: Record<string, any> = {};
      Object.keys(marks).forEach((k) => {
        normalized[k] = {
          marked: true,
          dotColor: GREEN,
          selectedColor: GREEN,
          selected: marks[k]?.selected || false,
        };
      });
      setMarkedDates(normalized);
    } catch (e: any) {
      console.error('[Availability] onOpenCalendar error:', e);
      Alert.alert(
        'Availability Error',
        e?.message || 'Unable to load available dates. Check Firestore data and rules.'
      );
      setMarkedDates({});
    } finally {
      setLoadingAvailability(false);
    }
  };

  const onDaySelect = async (day: DateData) => {
    const iso = day.dateString;
    setDateISO(iso);
    setMarkedDates((prev) => ({
      ...prev,
      [iso]: {
        ...(prev[iso] ?? {}),
        selected: true,
        selectedColor: GREEN,
        marked: true,
        dotColor: GREEN,
      },
    }));
    setCalendarOpen(false);

    try {
      const slots = await fetchSlotsForDay(iso);
      setAvailableSlots(Array.isArray(slots) ? slots : []);
      setTimeStr('');
      if ((slots || []).length === 0) {
        Alert.alert('No times', 'There are no available times for the selected date.');
      } else {
        setSlotsOpen(true);
      }
    } catch (e) {
      console.error('Error fetching OSA slots:', e);
      Alert.alert('Error', 'Failed to load times for the selected date.');
    }
  };

  const onPickSlot = (slot: string) => {
    setTimeStr(slot);
    setSlotsOpen(false);
  };

  const onSubmit = async () => {
    if (!docType || !purpose || !dateISO || !fullName || !studentId || !releaseMode) {
      Alert.alert('Missing info', 'Please complete all required fields.');
      return;
    }

    // if slots exist, require a time selection
    if (availableSlots.length > 0 && !timeStr) {
      Alert.alert('Pick time', 'Please choose an available time for your preferred date.');
      return;
    }

    const uid = auth().currentUser?.uid;
    if (!uid) {
      Alert.alert('Not signed in', 'Please login again.');
      return;
    }

    setSaving(true);
    try {
      await firestore()
        .collection(COLLECTION)
        .add({
          studentId,
          studentName: fullName,
          course: courseSection || 'N/A',
          documentType: docType,
          purpose: purpose.trim(),
          preferredDate: dateISO,
          preferredTime: timeStr || null,
          modeOfRelease: releaseMode.toLowerCase().replace(/\s+/g, '_'),
          notes: note?.trim() || 'N/A',
          requestedBy: requestedBy?.trim() || null,
          relationToStudent: relation?.trim() || null,
          office: 'osa',
          status: 'pending',
          createdByUid: uid,
          createdAt: firestore.FieldValue.serverTimestamp(),
        });

      Alert.alert('Submitted', 'Your request has been sent.');
      setPurpose('');
      setDateISO('');
      setTimeStr('');
      setNote('');
      setRequestedBy('');
      setRelation('');
      setAvailableSlots([]);
      setMarkedDates({});
    } catch (e: any) {
      console.error('submit error:', e);
      Alert.alert('Error', e?.message || 'Failed to submit request.');
    } finally {
      setSaving(false);
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

        <TouchableOpacity style={styles.profileBubble} onPress={() => navigation.navigate('Profile')}>
          <Image source={require('./assets/profileblue.png')} style={styles.profileIconSmall} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Good Moral Request</Text>

          <View style={[styles.inputWrap, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontWeight: '700', fontSize: 15 }}>{docType}</Text>
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { textAlign: 'center' }]}
              placeholder="Purpose (e.g., Scholarship, Employment)"
              placeholderTextColor={PLACEHOLDER}
              value={purpose}
              onChangeText={setPurpose}
            />
          </View>

          <TouchableOpacity style={styles.inputWrap} activeOpacity={0.9} onPress={onOpenCalendar}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 15,
                fontWeight: '600',
                color: dateISO ? TEXT_DARK : PLACEHOLDER,
              }}
            >
              {dateISO ? prettyDate(dateISO) : 'Available Date'}
            </Text>
            <Image source={require('./assets/calendarfield.png')} style={styles.trailingIcon} />
          </TouchableOpacity>

          {/* show chosen time if selected */}
          <TouchableOpacity
            style={styles.inputWrap}
            activeOpacity={0.9}
            onPress={() => {
              if (!dateISO) return Alert.alert('Pick a date first', 'Please choose a date first.');
              if (availableSlots.length === 0) return Alert.alert('No times', 'No times available for this date.');
              setSlotsOpen(true);
            }}
          >
            <Text
              style={{
                textAlign: 'center',
                fontSize: 15,
                fontWeight: '600',
                color: timeStr ? TEXT_DARK : PLACEHOLDER,
              }}
            >
              {timeStr ? (() => {
                const [hStr, m = '00'] = timeStr.split(':');
                let h = parseInt(hStr, 10);
                if (Number.isNaN(h)) return timeStr;
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12 || 12;
                return `${h}:${m.padStart(2, '0')} ${ampm}`;
              })() : 'Preferred Time (optional)'}
            </Text>
            <Image source={require('./assets/time.png')} style={styles.trailingIcon} />
          </TouchableOpacity>

          {/* Identity fields */}
          <View style={[styles.inputWrap, styles.readOnlyWrap]}>
            <TextInput
              style={[styles.input, styles.readOnlyInput, { textAlign: 'center' }]}
              placeholder="Full Name"
              placeholderTextColor={PLACEHOLDER}
              value={fullName}
              editable={false}
            />
          </View>

          <View style={[styles.inputWrap, styles.readOnlyWrap]}>
            <TextInput
              style={[styles.input, styles.readOnlyInput, { textAlign: 'center' }]}
              placeholder="Course/Year & Section"
              placeholderTextColor={PLACEHOLDER}
              value={courseSection}
              editable={false}
            />
          </View>

          <View style={[styles.inputWrap, studentId ? styles.readOnlyWrap : null]}>
            <TextInput
              style={[styles.input, studentId ? styles.readOnlyInput : null, { textAlign: 'center' }]}
              placeholder="Student ID"
              placeholderTextColor={PLACEHOLDER}
              value={studentId}
              onChangeText={setStudentId}
              editable={!Boolean(studentId)}
            />
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { textAlign: 'center' }]}
              placeholder="Requested By"
              placeholderTextColor={PLACEHOLDER}
              value={requestedBy}
              onChangeText={setRequestedBy}
            />
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { textAlign: 'center' }]}
              placeholder="Relationship to Student"
              placeholderTextColor={PLACEHOLDER}
              value={relation}
              onChangeText={setRelation}
            />
          </View>

          <View style={[styles.inputWrap, { height: 90, alignItems: 'stretch' }]}>
            <TextInput
              style={[
                styles.input,
                {
                  textAlign: 'center',
                  height: '100%',
                  textAlignVertical: 'top',
                  paddingTop: 12,
                },
              ]}
              placeholder="Additional Note (optional)"
              placeholderTextColor={PLACEHOLDER}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={[styles.inputWrap, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontWeight: '700', fontSize: 15 }}>{releaseMode}</Text>
          </View>

          <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={onSubmit} disabled={saving}>
            <Text style={styles.submitText}>{saving ? 'Submitting…' : 'Submit Request'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Calendar Modal */}
      <Modal transparent visible={calendarOpen} animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPressOut={() => setCalendarOpen(false)}>
          <View style={styles.modalCardWide}>
            <Text style={styles.modalTitle}>{loadingAvailability ? 'Loading…' : 'Choose an available date (OSA)'}</Text>
            <View style={styles.modalDivider} />
           <Calendar
  markingType={'simple' as any}    // <-- cast to any to satisfy TS
  markedDates={markedDates}
  onDayPress={onDaySelect}
  minDate={new Date().toISOString().slice(0, 10)}
  theme={{
    todayTextColor: GREEN,
    arrowColor: GREEN,
    monthTextColor: '#0F172A',
    textSectionTitleColor: '#64748B',
    selectedDayBackgroundColor: GREEN,
    selectedDayTextColor: '#ffffff',
  }}
/>

          </View>
        </TouchableOpacity>
      </Modal>

      {/* Slots Modal */}
      <Modal transparent visible={slotsOpen} animationType="fade" onRequestClose={() => setSlotsOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPressOut={() => setSlotsOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Available times</Text>
            <View style={styles.modalDivider} />
            {availableSlots.length === 0 ? (
              <Text style={{ textAlign: 'center', paddingVertical: 12, color: '#1F2937' }}>No times</Text>
            ) : (
              availableSlots.map((slot, i) => (
                <React.Fragment key={`${slot}-${i}`}>
                  <TouchableOpacity
                    onPress={() => onPickSlot(slot)}
                    activeOpacity={0.9}
                    style={[styles.optRow, slot === timeStr ? styles.optRowSelected : null]}
                  >
                    <Text style={[styles.optText, slot === timeStr ? styles.optTextSelected : null]}>
                      {(() => {
                        const parts = String(slot).split(':');
                        const h = parseInt(parts[0] || '0', 10);
                        const m = (parts[1] || '00').padStart(2, '0');
                        if (Number.isNaN(h)) return slot;
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        const hh = h % 12 || 12;
                        return `${hh}:${m} ${ampm}`;
                      })()}
                    </Text>
                    {slot === timeStr ? <Text style={styles.optTick}>✓</Text> : null}
                  </TouchableOpacity>
                  {i < availableSlots.length - 1 ? <View style={styles.modalSeparator} /> : null}
                </React.Fragment>
              ))
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

export default StudentRequestDocs;

/* ----------------- styles ----------------- */
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
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIconSmall: { width: 18, height: 18, resizeMode: 'contain', tintColor: '#fff' },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 22,
    paddingHorizontal: 16,
    marginTop: 16,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    gap: 12,
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
  title: {
    alignSelf: 'center',
    color: '#fff',
    fontWeight: '900',
    fontSize: 20,
    marginBottom: 4,
  },
  inputWrap: {
    position: 'relative',
    backgroundColor: INPUT_BG,
    borderRadius: 8,
    height: 50,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingRight: 20,
    justifyContent: 'center',
  },
  input: {
    color: TEXT_DARK,
    fontSize: 15,
    fontWeight: '600',
  },
  trailingIcon: {
    position: 'absolute',
    right: 10,
    width: 22,
    height: 22,
    resizeMode: 'contain',
    top: 14,
  },
  submitBtn: {
    backgroundColor: GREEN,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalCardWide: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    maxHeight: '85%',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_DARK,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#E6E9EE',
    marginBottom: 8,
  },
  modalSeparator: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 6,
  },

  optRow: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optRowSelected: {
    backgroundColor: '#EEF2F6',
    borderRadius: 8,
  },
  optText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  optTextSelected: {
    color: NAVY,
  },
  optTick: {
    color: GREEN,
    fontWeight: '700',
    marginLeft: 8,
  },

  readOnlyWrap: {
    backgroundColor: '#F3F4F6',
  },
  readOnlyInput: {
    color: '#374151',
  },
});
