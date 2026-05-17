import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

// ADD: image picker import (base64)
import { launchImageLibrary } from 'react-native-image-picker';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

const NAVY = '#020120';

type Role = 'student' | 'guard' | 'admin' | 'faculty';

type ProfileData = {
  name?: string;
  email?: string;
  contact_num?: string;
  live?: string;
  sectionId?: string;
  studentID?: string;
  uid?: string;
  department?: string;
  position?: string;
  photoBase64?: string; // optional field for inline image / data URI
  // new emergency fields
  emergency_person?: string;
  emergency_num?: string;
};

// <-- FIXED: include photoBase64 on StoredUser so parsed?.photoBase64 is valid
type StoredUser = {
  role: Role;
  id: string;
  uid: string;
  name?: string;
  photoBase64?: string;
};

// Works with SDKs that expose `exists` as a function OR a boolean
const dsExists = (snap: any): boolean =>
  typeof snap?.exists === 'function' ? snap.exists() : !!snap?.exists;

export default function ProfileScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [data, setData] = useState<ProfileData>({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // -------------------------
  // Helper: read parsed currentUser from AsyncStorage (if present)
  // -------------------------
  const readParsedCurrentUser = async (): Promise<StoredUser | null> => {
    try {
      const raw = await AsyncStorage.getItem('currentUser');
      return raw ? (JSON.parse(raw) as StoredUser) : null;
    } catch {
      return null;
    }
  };

  // -------------------------
  // Apply local photo fallback (Auth photoURL -> currentUser.photoBase64 -> per-user cache)
  // -------------------------
  const applyLocalPhotoFallback = async (parsedStoredUser?: StoredUser | null) => {
    try {
      // 1) auth profile photo (most authoritative)
      const authPhoto = auth().currentUser?.photoURL;
      if (authPhoto) {
        setData(prev => ({ ...prev, photoBase64: prev.photoBase64 ?? authPhoto }));
        return;
      }

      // 2) try currentUser stored blob in AsyncStorage (legacy)
      const parsed = parsedStoredUser ?? (await readParsedCurrentUser());
      if (parsed?.photoBase64) {
        setData(prev => ({ ...prev, photoBase64: prev.photoBase64 ?? parsed.photoBase64 }));
        return;
      }

      // 3) migration: if a legacy global cache exists, move it to per-user key (one-time)
      const legacy = await AsyncStorage.getItem('profilePhotoCache');
      const uidNow = auth().currentUser?.uid ?? parsed?.uid ?? null;
      if (legacy && uidNow) {
        const perKey = `profilePhotoCache:${uidNow}`;
        await AsyncStorage.setItem(perKey, legacy);
        await AsyncStorage.removeItem('profilePhotoCache');
      }

      // 4) profilePhotoCache per-user
      const uidForCache = uidNow;
      if (uidForCache) {
        const cacheKey = `profilePhotoCache:${uidForCache}`;
        const cache = await AsyncStorage.getItem(cacheKey);
        if (cache) {
          setData(prev => ({ ...prev, photoBase64: prev.photoBase64 ?? cache }));
          return;
        }
      }
      // else no fallback available
    } catch (e) {
      console.warn('applyLocalPhotoFallback error', e);
    }
  };

  // -------------------------
  // load profile on mount
  // -------------------------
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        const raw = await AsyncStorage.getItem('currentUser');
        const parsed: StoredUser | null = raw ? JSON.parse(raw) : null;

        if (!parsed?.role || !parsed?.uid) {
          if (mounted) setLoading(false);
          Alert.alert('Not signed in', 'Please login again.');
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          return;
        }

        setRole(parsed.role);

        if (parsed.role === 'student') {
          // Prefer explicitly saved studentID; fall back to what was typed at login
          const savedStudentID = (await AsyncStorage.getItem('currentStudentID')) || parsed.id;

          // 1) Try /students/{AUTH_UID}
          const byUidDoc = await firestore().collection('students').doc(parsed.uid).get();
          let sData: any | null = dsExists(byUidDoc) ? byUidDoc.data() : null;

          // 2) Try common fields that might hold the student number
          if (!sData) {
            const fields = ['studentID', 'uid', 'student_id', 'student_ID'];
            for (const field of fields) {
              const qs = await firestore()
                .collection('students')
                .where(field, '==', savedStudentID)
                .limit(1)
                .get();
              if (!qs.empty) {
                sData = qs.docs[0].data();
                break;
              }
            }
          }

          if (!sData) {
            if (mounted) {
              Alert.alert('Profile', 'Student record not found.');
              setData({
                name: parsed.name ?? '',
                email: '',
                sectionId: '',
                studentID: savedStudentID,
                contact_num: '',
                live: '',
                emergency_person: '',
                emergency_num: '',
              });
              await applyLocalPhotoFallback(parsed);
            }
          } else {
            if (mounted) {
              setData({
                name: sData?.name ?? parsed.name ?? '',
                email: sData?.email ?? '',
                sectionId: sData?.course ?? '',
                studentID: sData?.studentID ?? sData?.uid ?? savedStudentID,
                contact_num: sData?.contact_num ?? '',
                live: sData?.live ?? '',
                photoBase64: sData?.photoBase64 ?? undefined,
                emergency_person: sData?.emergency_person ?? sData?.emergencyContact ?? sData?.emergency_person_name ?? '',
                emergency_num: sData?.emergency_num ?? sData?.emergency_numbr ?? sData?.emergency_contact_num ?? '',
              });
              await applyLocalPhotoFallback(parsed);
            }
          }
        } else {
          // ── STAFF (GUARD / ADMIN / FACULTY / OSA) ─────────────────────────
          const a = auth().currentUser;

          // 1) /users/{AUTH_UID}
          const byId = await firestore().collection('users').doc(parsed.uid).get();
          let u: any = dsExists(byId) ? byId.data() : null;

          // 2) /users where uid == AUTH_UID
          if (!u) {
            const qs = await firestore()
              .collection('users')
              .where('uid', '==', parsed.uid)
              .limit(1)
              .get();
            u = qs.docs[0]?.data() ?? null;
          }

          // 3) /users where email == currentUser.email
          if (!u && a?.email) {
            const qs2 = await firestore()
              .collection('users')
              .where('email', '==', a.email)
              .limit(1)
              .get();
            u = qs2.docs[0]?.data() ?? null;
          }

          // 4) /users where username == the ID they typed at login
          if (!u) {
            const qs3 = await firestore()
              .collection('users')
              .where('username', '==', parsed.id)
              .limit(1)
              .get();
            u = qs3.docs[0]?.data() ?? null;
          }

          if (!u) {
            // Fallback so it doesn’t render blank
            setData({
              name: parsed.name ?? parsed.id,
              email: a?.email ?? '',
              uid: parsed.id,
              sectionId: (parsed.role || '').toUpperCase(),
              contact_num: '',
              live: '',
              emergency_person: '',
              emergency_num: '',
            });
            await applyLocalPhotoFallback(parsed);
          } else {
            // Prefer department label; else ROLE in uppercase
            const roleUpper = (u.role || parsed.role || '').toUpperCase();
            const deptOrRole = (u.department || roleUpper || '').toString();

            setData({
              name: u.name ?? parsed.name ?? parsed.id,
              email: u.email ?? a?.email ?? '',
              uid: u.uid ?? u.username ?? parsed.id,
              sectionId: deptOrRole,
              department: u.department ?? '',
              position: u.position ?? '',
              contact_num: u.contact_num ?? '',
              live: u.live ?? '',
              photoBase64: u.photoBase64 ?? undefined,
              emergency_person: u.emergency_person ?? u.emergencyContact ?? '',
              emergency_num: u.emergency_num ?? u.emergency_number ?? '',
            });
            await applyLocalPhotoFallback(parsed);
          }
        }
      } catch (e) {
        console.log('Profile load error:', e);
        Alert.alert('Error', 'Failed to load profile.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      // cleanup
    };
  }, [navigation]);

  // -------------------------
  // Image (base64) upload flow
  // -------------------------
  async function handleChangePhoto() {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        maxWidth: 800,
        maxHeight: 800,
        selectionLimit: 1,
      });

      if (res.didCancel) return;
      if (res.errorCode) {
        Alert.alert('Error', res.errorMessage ?? 'Failed to pick image.');
        return;
      }

      const asset = res.assets?.[0];
      if (!asset || !asset.base64 || !asset.type) {
        Alert.alert('Error', 'Could not read image data.');
        return;
      }

      // Small / compressed base64 data URL
      const base64Data = `data:${asset.type};base64,${asset.base64}`;

      setUploadingPhoto(true);

      // Prefer auth uid (more reliable)
      let uid = auth().currentUser?.uid ?? null;
      if (!uid) {
        try {
          const raw = await AsyncStorage.getItem('currentUser');
          const parsed = raw ? JSON.parse(raw as any) : null;
          uid = parsed?.uid ?? null;
        } catch {
          uid = null;
        }
      }

      if (!uid) {
        Alert.alert('Error', 'User ID not found.');
        setUploadingPhoto(false);
        return;
      }

      // 1) Update the Auth user profile first (allowed client-side)
      try {
        await auth().currentUser?.updateProfile({ photoURL: base64Data });
      } catch (err) {
        console.warn('Could not update auth profile (non-fatal):', err);
      }

      // 2) Try to update Firestore users doc — but this may fail with permission-denied.
      // We'll catch permission errors and ignore them (so app keeps working).
      try {
        await firestore().collection('users').doc(uid).update({
          photoBase64: base64Data,
        });
      } catch (err: any) {
        console.warn('firestore photo update failed (likely permission):', err);
      }

      // Update UI immediately from local state
      setData(prev => ({ ...prev, photoBase64: base64Data }));

      // Update AsyncStorage currentUser if present (optional)
      try {
        const raw = await AsyncStorage.getItem('currentUser');
        const parsed: any = raw ? JSON.parse(raw) : null;
        if (parsed) {
          parsed.photoBase64 = base64Data;
          await AsyncStorage.setItem('currentUser', JSON.stringify(parsed));
        }
        // ALSO update the per-user profilePhotoCache so it survives logout clear()
        await AsyncStorage.setItem(`profilePhotoCache:${uid}`, base64Data);
      } catch (e) {
        console.warn('AsyncStorage write error', e);
      }

      Alert.alert('Success', 'Profile photo updated.');
    } catch (err) {
      console.error('photo update error', err);
      Alert.alert('Error', 'Failed to update photo.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  // -------------------------
  // Logout: clear session keys only (do not wipe per-user caches)
  // -------------------------
const handleLogout = async () => {
  try {
    // 1️⃣ Get last login log ID saved during login
    const logId = await AsyncStorage.getItem('lastLoginLogId');

    // 2️⃣ Update login_logs (for Super Admin visibility)
    if (logId) {
      await firestore()
        .collection('login_logs')
        .doc(logId)
        .update({
          status: 'Logged Out',
          logoutTime: new Date().toLocaleString(),
        });

      // cleanup after update
      await AsyncStorage.removeItem('lastLoginLogId');
    }

    // 3️⃣ Firebase sign out
    await auth().signOut();

    // 4️⃣ Clear ONLY session-related keys
    await AsyncStorage.multiRemove([
      'currentUid',
      'currentUser',
      'currentStudentID',
      'currentStudentName',
      'currentStudentCourse',
    ]);

    // 5️⃣ Go back to Login screen
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  } catch (err) {
    console.error('Logout failed:', err);
    Alert.alert('Error', 'Failed to logout. Please try again.');
  }
};

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Image source={require('./assets/shieldlogo.png')} style={styles.brandLogo} />
          <Text style={styles.brandText}>Smart</Text>
        </View>
        <TouchableOpacity style={styles.profileBubble} onPress={() => {}}>
          <Image source={require('./assets/profileblue.png')} style={styles.profileIconSmall} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            {/* Close (X) */}
            <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
              <Text style={{ color: 'white', fontSize: 28, fontWeight: '900', marginTop: -6 }}>×</Text>
            </TouchableOpacity>

            {/* Avatar */}
            <View style={styles.avatarCircle}>
              <Image
                source={
                  data.photoBase64
                    ? { uri: data.photoBase64 }
                    : auth().currentUser?.photoURL
                    ? { uri: auth().currentUser!.photoURL! }
                    : require('./assets/profileblue.png')
                }
                style={{ width: 55, height: 55, borderRadius: 999 }}
              />
            </View>

            {/* Change photo */}
            <TouchableOpacity style={styles.changeBtn} onPress={handleChangePhoto} disabled={uploadingPhoto}>
              <Text style={styles.changeBtnText}>{uploadingPhoto ? 'Uploading…' : 'Change Photo'}</Text>
            </TouchableOpacity>

            {/* Name / meta */}
            <Text style={styles.name}>{data.name ?? '—'}</Text>
            <Text style={styles.meta}>
              {role === 'student'
                ? `${data.sectionId ?? ''}${data.sectionId ? ' | ' : ''}${data.studentID ?? ''}`
                : data.sectionId ?? data.uid ?? '—'}
            </Text>

            {/* Info rows */}
            <View style={styles.infoBlock}>
              <InfoRow icon={require('./assets/gmail.png')} text={data.email ?? '—'} />
              <InfoRow icon={require('./assets/phone.png')} text={data.contact_num ?? '—'} />
              <InfoRow icon={require('./assets/address.png')} text={data.live ?? '—'} />
              {/* NEW: emergency contact person */}
              <InfoRow icon={require('./assets/emergency-contact.png')} text={data.emergency_person ?? '—'} />
              {/* NEW: emergency number */}
              <InfoRow icon={require('./assets/sos.png')} text={data.emergency_num ?? '—'} />
            </View>

            {/* Logout */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
        
      )}
    </SafeAreaView>
  );
}

function InfoRow({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Image source={icon} style={styles.infoIcon} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}
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
  brandWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  brandLogo: { width: 80, height: 80, resizeMode: 'contain' },
  brandText: {
    fontSize: 45, color: '#fff', fontFamily: 'Genos-SemiBold', fontWeight: '400', letterSpacing: 0.5, marginLeft: 4,
  },
  profileBubble: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10, elevation: 10,
  },
  profileIconSmall: { width: 18, height: 18, resizeMode: 'contain', tintColor: '#fff' },

  cardWrap: { paddingHorizontal: 30, paddingTop: 100 },
  card: {
    backgroundColor: '#344CB7',
    borderRadius: 12,
    paddingTop: 30,
    paddingBottom: 40,
    paddingHorizontal: 24,
    elevation: 30,
  },
  closeBtn: {
    position: 'absolute', right: 10, top: 10, width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#FF4D4F', alignItems: 'center', justifyContent: 'center',
  },
  avatarCircle: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#1f3488ff',
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
  },
  changeBtn: {
    alignSelf: 'center', marginTop: 8, backgroundColor: '#FFC107',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
  },
  changeBtnText: { color: '#000', fontWeight: '800' },
  name: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 20 },
  meta: {
    color: '#E6EBFF', fontWeight: '900', fontFamily: 'Inter', fontSize: 15,
    textAlign: 'center', marginTop: 8, marginBottom: 12,
  },
  infoBlock: { marginTop: 30 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingLeft: 10 },
  infoIcon: { width: 26, height: 26, marginRight: 16, resizeMode: 'contain' },
  infoText: { color: '#fff', fontSize: 16, fontWeight: '500', flexShrink: 1 },
  logoutBtn: {
    marginTop: 40, backgroundColor: '#FF4D4F', paddingVertical: 12,
    borderRadius: 8, alignItems: 'center',
  },
  logoutText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
