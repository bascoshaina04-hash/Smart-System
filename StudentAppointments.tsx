// StudentAppointments.tsx
//Student to guidance
import React, { useMemo, useState, useEffect } from 'react';
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
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { Calendar, DateData } from 'react-native-calendars';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Props = NativeStackScreenProps<RootStackParamList, 'StudentAppointments'>;

const NAVY = '#020120';
const INPUT_BG = '#FFFFFF';
const ORANGE = '#FCB316';
const PLACEHOLDER = '#7A7F87';
const TEXT_DARK = '#0F172A';
const GREEN = '#16a34a';

const offices = ['Guidance', 'OSA'];

const purposes = ['Consultation', 'Exit Interview'];

/* ----------------- Helpers ----------------- */
const docExists = (snap: any): boolean =>
  typeof snap?.exists === 'function' ? snap.exists() : !!snap?.exists;

const titleCase = (s: string) =>
  s
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

  const fromAuth = (authUser?.displayName as string) || '';
  if (fromAuth) return titleCase(fromAuth);

  const email = ((authUser?.email as string) || (d?.email as string) || '').toLowerCase();
  const local = (email.split('@')[0] || '').trim();
  if (local) return titleCase(local.replace(/[._-]+/g, ' '));

  return '';
};

const resolveCurrentStudent = async (): Promise<{
  studentID: string;
  studentName: string;
  course: string;
}> => {
  const authUser = auth().currentUser;
  const raw = await AsyncStorage.getItem('currentUser');
  const parsed: any = raw ? JSON.parse(raw) : null;

  const savedStudentID = (await AsyncStorage.getItem('currentStudentID')) || '';
  const savedCourse = (await AsyncStorage.getItem('currentStudentCourse')) || '';

  const emailLocal = (authUser?.email || '').split('@')[0] || '';
  const candidateIds: (string | number)[] = [];
  if (savedStudentID) candidateIds.push(savedStudentID);
  if (parsed?.id) candidateIds.push(parsed.id);
  if (parsed?.uid) candidateIds.push(parsed.uid);
  if (emailLocal) candidateIds.push(emailLocal);

  const FIELDS = ['studentID', 'student_id', 'studentNumber', 'idNumber', 'sid', 'uid', 'id', 'ID'];

  let found: any = null;

  // Try docId
  for (const cid of candidateIds) {
    const idStr = String(cid ?? '').trim();
    if (!idStr) continue;
    const snap = await firestore().collection('students').doc(idStr).get();
    if (docExists(snap)) { found = snap.data(); break; }
  }

  // Try field queries
  if (!found) {
    outer: for (const cid of candidateIds) {
      for (const f of FIELDS) {
        const qs = await firestore().collection('students').where(f, '==', cid).limit(1).get();
        if (!qs.empty) { found = qs.docs[0].data(); break outer; }
      }
    }
  }

  const studentID = String(
    found?.studentID ??
      found?.student_id ??
      found?.studentNumber ??
      found?.idNumber ??
      found?.sid ??
      found?.uid ??
      found?.id ??
      found?.ID ??
      candidateIds.find(Boolean) ??
      ''
  );

  const studentName =
    buildStudentName(found ?? {}, authUser) ||
    (parsed?.name ? titleCase(parsed.name) : '') ||
    (emailLocal ? titleCase(emailLocal.replace(/[._-]+/g, ' ')) : 'Student');

  const course = String(found?.course ?? found?.program ?? found?.degree ?? savedCourse ?? '').trim();

  return { studentID, studentName, course };
};

/* ----------------- Small reusable select ----------------- */
const SelectOption = ({
  label,
  selected,
  onPress,
}: { label: string; selected: boolean; onPress: () => void }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.9}
    style={[styles.optRow, selected && styles.optRowSelected]}
  >
    <Text style={[styles.optText, selected && styles.optTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

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
            <Text style={styles.modalTitle}>Select an option</Text>
            <View style={styles.modalDivider} />
            {options.map((opt, idx) => (
              <React.Fragment key={opt}>
                <SelectOption
                  label={opt}
                  selected={opt === value}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                />
                {idx < options.length - 1 ? <View style={styles.modalSeparator} /> : null}
              </React.Fragment>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

// “09:00” -> “9:00 AM”
const toAmPm = (slot: string) => {
  const [hStr, m = '00'] = slot.split(':');
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return slot;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.padStart(2, '0')} ${ampm}`;
};

// Slots (nested office path, fallback top-level)
const fetchSlotsForDay = async (office: string, isoDate: string) => {
  // build expected ID:  2025-12-09__guidance
  const docId = `${isoDate}__${office.toLowerCase()}`;

  const snap = await firestore().collection('availability').doc(docId).get();

  if (!snap.exists) return [];

  const data = snap.data() as any;

  return Array.isArray(data.slots) ? data.slots : [];
};
// Replace your prettyDate const with this function declaration
function prettyDate(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
}

/* ----------------- Screen ----------------- */
const StudentAppointments: React.FC<Props> = ({ navigation }) => {
  // form state
  const [office, setOffice] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [course, setCourse] = useState<string>('');   // read-only
  const [dateISO, setDateISO] = useState<string>('');
  const [timeStr, setTimeStr] = useState<string>('');
  const [concern, setConcern] = useState('');
  const [submitting, setSubmitting] = useState(false);


  // UI state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [slotsOpen, setSlotsOpen] = useState(false);

  // availability
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const timeDisplay = useMemo(() => (timeStr ? toAmPm(timeStr) : ''), [timeStr]);

  // Prefill course
  useEffect(() => {
    (async () => {
      try {
        const who = await resolveCurrentStudent();
        if (who.course) setCourse(who.course);
      } catch {}
    })();
  }, []);
const loadAvailableDays = async (whichOffice: string) => {
  setLoadingAvailability(true);
  try {
    const marks: Record<string, any> = {};

    // fetch ALL docs under availability
    const snap = await firestore().collection('availability').get();

    snap.forEach((doc) => {
      const id = doc.id; // ex: 2025-12-09__guidance
      const data = doc.data() as any;

      // extract date + office
      const [dateStr, officeStr] = id.split('__');

      if (!dateStr || !officeStr) return;

      // match office (case-insensitive)
      if (officeStr.toLowerCase() !== whichOffice.toLowerCase()) return;

      // valid date format?
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        marks[dateStr] = {
          marked: true,
          dotColor: GREEN,
          selectedColor: GREEN,
        };
      }
    });

    setMarkedDates(marks);
  } catch (e) {
    console.log('loadAvailableDays error:', e);
    Alert.alert('Error', 'Failed to load available dates.');
  } finally {
    setLoadingAvailability(false);
  }
};

  const onOpenCalendar = async () => {
    if (!office) {
      Alert.alert('Choose office', 'Please select an office first.');
      return;
    }
    await loadAvailableDays(office);
    setCalendarOpen(true);
  };

  const onDaySelect = async (day: DateData) => {
    const iso = day.dateString;
    if (!markedDates[iso]) {
      Alert.alert('Not available', 'Please pick one of the highlighted dates.');
      return;
    }

    setDateISO(iso);
    setCalendarOpen(false);

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

    try {
      const slots = await fetchSlotsForDay(office, iso);
      setAvailableSlots(slots);
      setTimeStr('');
      setSlotsOpen(true);
    } catch (e) {
      console.log('load slots error:', e);
      Alert.alert('Error', 'Failed to load time slots.');
    }
  };

  const onPickSlot = (slot: string) => {
    setTimeStr(slot);
    setSlotsOpen(false);
  };

  const onBook = async () => {
    if (submitting) return; // 🚫 block double taps

    if (!office || !purpose || !dateISO || !timeStr) {
      Alert.alert('Missing info', 'Please select office, purpose, date, and time.');
      return;
    }
    if (!course) {
      Alert.alert(
        'Course required',
        'Your course is not set on your profile. Please contact the administrator/registrar to update it.'
      );
      return;
    }
  setSubmitting(true); // 🔒 lock submit
    try {
      const who = await resolveCurrentStudent();
      if (!who || !who.studentName) {
        Alert.alert('Missing student', 'We could not resolve the student profile.');
        return;
      }
// 🔎 Check for duplicate booking
const dupSnap = await firestore()
  .collection('appointments')
  .where('studentID', '==', who.studentID)
  .where('office', '==', office.toLowerCase())
  .where('date', '==', dateISO)
  .where('time', '==', timeStr)
  .where('status', 'in', ['pending', 'approved'])
  .limit(1)
  .get();

if (!dupSnap.empty) {
  Alert.alert(
    'Already booked',
    'You already have an appointment scheduled for this date and time.'
  );
  return;
}

      const apptRef = await firestore().collection('appointments').add({
        office: office.toLowerCase(),
        purpose,
        course,                      // saved (read-only field)
        date: dateISO,
        time: timeStr,
        concern,
        studentID: who.studentID || null,
        studentName: who.studentName,
        status: 'pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      await firestore().collection('notifications').add({
        type: 'appointment_created',
        office: office.toLowerCase(),
        appointmentId: apptRef.id,
        recipients: [office.toLowerCase()],
        title: `New ${office} Appointment`,
        body: `${who.studentName} — ${purpose} on ${prettyDate(dateISO)} at ${toAmPm(timeStr)} • ${course}`,
        createdAt: firestore.FieldValue.serverTimestamp(),
        readBy: [],
      });

      Alert.alert('Booked!', 'Your appointment request has been submitted.');
      setPurpose('');
      setDateISO('');
      setTimeStr('');
      setConcern('');
      // keep course as-is (read-only)
    } catch (e: any) {
      console.log('BOOK ERROR', e);
      Alert.alert('Error', e?.message ?? 'Failed to book appointment.');
    }finally {
      setSubmitting(false); // 🔓 unlock
  }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={styles.header}>
       <View style={styles.brandWrap}>
  <Image source={require('./assets/shieldlogo.png')} style={styles.brandLogo} />
  <Text style={{ fontSize: 40, fontFamily: 'Genos-SemiBold', color: '#fff' }}>Smart</Text>
</View>

        <TouchableOpacity style={styles.profileBubble} onPress={() => navigation.navigate('Profile')}>
          <Image source={require('./assets/profileblue.png')} style={styles.profileIconSmall} />
        </TouchableOpacity>
      </View>
     

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Schedule Appointment</Text>

          {/* Office */}
          <CustomSelect
            placeholder="Select Office"
            value={office}
            options={offices}
            onChange={(v) => {
              setOffice(v);
              setDateISO('');
              setTimeStr('');
              setMarkedDates({});
            }}
          />

          {/* Purpose */}
          <CustomSelect placeholder="Purpose" value={purpose} options={purposes} onChange={setPurpose} />

          {/* Course (READ-ONLY) */}
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { textAlign: 'center', color: TEXT_DARK }]}
              placeholder="Course (e.g., BSIT)"
              placeholderTextColor={PLACEHOLDER}
              value={course}
              editable={false}               // ← not editable
              selectTextOnFocus={false}
            />
          </View>

          {/* Date (opens calendar) */}
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

          {/* Time (opens slots) */}
          <TouchableOpacity
            style={styles.inputWrap}
            activeOpacity={0.9}
            onPress={() => {
              if (!dateISO) return Alert.alert('Pick a date first', 'Please choose an available date.');
              if (availableSlots.length === 0) return Alert.alert('No slots', 'No time slots for this day.');
              setSlotsOpen(true);
            }}
          >
            <Text
              style={{
                textAlign: 'center',
                fontSize: 15,
                fontWeight: '600',
                color: timeDisplay ? TEXT_DARK : PLACEHOLDER,
              }}
            >
              {timeDisplay || 'Time'}
            </Text>
            <Image source={require('./assets/time.png')} style={styles.trailingIcon} />
          </TouchableOpacity>

          {/* Concern */}
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { textAlign: 'center' }]}
              placeholder="Briefly describe your concern"
              placeholderTextColor={PLACEHOLDER}
              value={concern}
              onChangeText={setConcern}
            />
          </View>

         <TouchableOpacity
  style={[styles.bookBtn, submitting && { opacity: 0.6 }]}
  onPress={onBook}
  disabled={submitting}
>
            <Text style={styles.bookText}>Book Appointment</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Calendar modal */}
      <Modal transparent visible={calendarOpen} animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPressOut={() => setCalendarOpen(false)}>
          <View style={styles.modalCardWide}>
            <Text style={styles.modalTitle}>
              {loadingAvailability ? 'Loading…' : `Choose a date for ${office}`}
            </Text>
            <View style={styles.modalDivider} />
            <Calendar
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

      {/* Slots modal */}
      <Modal transparent visible={slotsOpen} animationType="fade" onRequestClose={() => setSlotsOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPressOut={() => setSlotsOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Available times</Text>
            <View style={styles.modalDivider} />
            {availableSlots.length === 0 ? (
              <Text style={{ textAlign: 'center', paddingVertical: 12, color: '#1F2937' }}>No slots</Text>
            ) : (
              availableSlots.map((slot, i) => (
                <React.Fragment key={`${slot}-${i}`}>
                  <SelectOption label={toAmPm(slot)} selected={slot === timeStr} onPress={() => onPickSlot(slot)} />
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

export default StudentAppointments;




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
    backgroundColor: '#040340',
    borderRadius: 12,
    paddingVertical: 35,
    paddingHorizontal: 18,
    marginTop: 80,
    marginHorizontal: 20,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  closeBtn: {
    position: 'absolute',
    right: 7,
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

  // modal
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
  modalCardWide: {
    width: '94%',
    maxWidth: 520,
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
    justifyContent: 'center',
    borderRadius: 5,
  },

  // transparent navy highlight
  optRowSelected: {
    backgroundColor: 'rgba(2, 1, 32, 0.30)', // NAVY with ~14% opacity
    borderColor: 'rgba(2, 1, 32, 0.35)',     // subtle outline so it reads
  },

  optText: { fontSize: 16, fontWeight: '600', color: '#1F2937', textAlign: 'center' },
  optTextSelected: { color: '#0F172A', fontWeight: '800' }, // keep text dark on light overlay
});
