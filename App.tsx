import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
} from 'react-native';

import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './application';

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as Keychain from 'react-native-keychain';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

const NAVY = '#020120';
const KEYCHAIN_SERVICE = 'smart_app_credentials';

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();

  const [rememberMe, setRememberMe] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  /* ================= HELPERS ================= */
  const dsExists = (snap: any): boolean =>
    typeof snap?.exists === 'function' ? snap.exists() : !!snap?.exists;

  /* ================= LOAD REMEMBERED ================= */
  useEffect(() => {
    (async () => {
      try {
        const savedUser = await AsyncStorage.getItem('rememberUsername');
        if (savedUser) {
          setUsername(savedUser);
          setRememberMe(true);
        }

        const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
        if (creds && typeof creds === 'object') {
          if (!savedUser || creds.username === savedUser) {
            setPassword(creds.password);
            setAutoFilled(true);
            setRememberMe(true);
            if (!savedUser) {
              setUsername(creds.username);
              await AsyncStorage.setItem('rememberUsername', creds.username);
            }
          }
        }
      } catch (e) {
        console.warn('Remember load error', e);
      }
    })();
  }, []);

  /* ================= REMEMBER ME ================= */
  const persistRemember = async (u: string, p: string) => {
    try {
      if (rememberMe) {
        await AsyncStorage.setItem('rememberUsername', u);
        await Keychain.setGenericPassword(u, p, {
          service: KEYCHAIN_SERVICE,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
        });
      } else {
        await AsyncStorage.removeItem('rememberUsername');
        await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
      }
    } catch (e) {
      console.warn('persistRemember error', e);
    }
  };

  /* ================= USERNAME → EMAIL ================= */
  const getEmailByUsername = async (raw: string): Promise<string | null> => {
    const s = raw.trim().toLowerCase();
    if (!s) return null;
    if (s.includes('@')) return s;

    try {
      const doc = await firestore().collection('usernames').doc(s).get();
      if (!dsExists(doc)) return null;
      return String(doc.data()?.email || '').toLowerCase() || null;
    } catch {
      return null;
    }
  };

  /* ================= LOGGING ================= */
  const logSuccessfulLogin = async (
    uid: string,
    userID: string,
    name: string,
    role: string
  ) => {
    const ref = await firestore().collection('login_logs').add({
      uid,
      userID,
      name,
      role,
      status: 'Logged In',
      loginTime: new Date().toLocaleString(),
      logoutTime: '',
      createdAt: firestore.FieldValue.serverTimestamp(),
    });

    await AsyncStorage.setItem('lastLoginLogId', ref.id);
  };

  const logFailedLogin = async (userID: string, reason: string) => {
    try {
      await firestore().collection('security_alerts').add({
        message: `Failed login attempt (${reason})`,
        userID,
        status: 'Failed',
        timestamp: firestore.FieldValue.serverTimestamp(),
      });
    } catch {}
  };

  /* ================= LOGIN ================= */
  const handleLogin = async () => {
    const id = username.trim();
    const pwd = password.trim();

    if (!id || !pwd) {
      Alert.alert('Missing info', 'Enter username and password.');
      return;
    }

    try {
      setLoading(true);

      const email = await getEmailByUsername(id);
      if (!email) {
        await logFailedLogin(id, 'Username not found');
        Alert.alert('Login failed', 'Username not found.');
        return;
      }

      const cred = await auth().signInWithEmailAndPassword(email, pwd);
      const uid = cred.user.uid;

      const userDoc = await firestore().collection('users').doc(uid).get();

      if (dsExists(userDoc)) {
        const profile = userDoc.data() || {};
        const active =
          String(profile.status || '').toLowerCase() === 'active' &&
          profile.isActive !== false;

        if (!active) {
          Alert.alert('Access blocked', 'Your account is not active.');
          return;
        }

        const role = profile.role || 'guard';
        const name = profile.name || id;

        await logSuccessfulLogin(uid, id, name, role);
        await persistRemember(id, pwd);

        await AsyncStorage.multiSet([
          ['currentUid', uid],
          ['currentUser', JSON.stringify({ role, id, uid, name })],
        ]);

        navigation.replace(
          role === 'faculty'
            ? 'FacultyDashboard'
            : role === 'student'
            ? 'StudentDashboard'
            : 'Dashboard'
        );
        return;
      }

      const sDoc = await firestore().collection('students').doc(uid).get();
      if (!dsExists(sDoc)) {
        Alert.alert('Login failed', 'Profile not found.');
        return;
      }

      const sData = sDoc.data() || {};
      const studentName = sData.name || id;

      await logSuccessfulLogin(uid, id, studentName, 'student');
      await persistRemember(id, pwd);

await AsyncStorage.multiSet([
  ['currentUid', uid],
  [
    'currentUser',
    JSON.stringify({
      role: 'student',
      uid,
      id,
      studentID: sData.studentID, // ✅ REQUIRED
      name: studentName,
    }),
  ],
  ['currentStudentID', sData.studentID ?? id],
  ['currentStudentName', studentName],
  ['currentStudentCourse', sData.course ?? ''],
]);

      navigation.replace('StudentDashboard', { displayName: studentName });
    } catch (e: any) {
      await logFailedLogin(id, e?.code || 'error');

      let msg = 'Login failed.';
      if (e?.code === 'auth/wrong-password') msg = 'Invalid username or password.';
      if (e?.code === 'auth/too-many-requests') msg = 'Too many attempts. Try later.';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  /* ================= RESET PASSWORD ================= */
  const handleResetPassword = async () => {
    const id = username.trim();
    if (!id) {
      Alert.alert('Forgot Password', 'Enter username or email first.');
      return;
    }

    try {
      setLoading(true);
      const email = await getEmailByUsername(id);
      if (!email) {
        Alert.alert('Forgot Password', 'Username not found.');
        return;
      }
      await auth().sendPasswordResetEmail(email);
      Alert.alert('Check your email', `Reset link sent to ${email}`);
    } catch {
      Alert.alert('Error', 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  };

  /* ================= UI (UNCHANGED) ================= */
  return (
    <View style={styles.container}>
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />

      <View style={styles.header}>
        <Image source={require('./assets/shieldlogo.png')} style={styles.logo} />
        <Text style={styles.smartText}>SMART</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.loginText}>Login</Text>

        <View style={styles.inputContainer}>
          <Image source={require('./assets/user.png')} style={styles.icon} />
          <TextInput
            placeholder="Username or Email"
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.inputContainer}>
          <Image source={require('./assets/locks.png')} style={styles.icon} />
          <TextInput
            placeholder="Password"
            style={styles.input}
            value={password}
            secureTextEntry={secure}
            onChangeText={(t) => {
              setPassword(t);
              setAutoFilled(false);
            }}
            placeholderTextColor="#999"
          />
          {!autoFilled && (
            <TouchableOpacity onPress={() => setSecure(!secure)}>
              <Image source={require('./assets/eyesclose.png')} style={styles.eyeIcon} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setRememberMe(!rememberMe)}>
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]} />
            <Text style={styles.checkboxLabel}>Remember me</Text>
          </TouchableOpacity>

          <Text style={styles.forgotPassword} onPress={handleResetPassword}>
            Forgot Password?
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.loginButton, loading && { opacity: 0.6 }]}
          onPress={handleLogin}
          disabled={loading}>
          <Text style={styles.loginButtonText}>
            {loading ? 'Signing in…' : 'Login'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomCircle} />
    </View>
  );
};

export default LoginScreen;



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 25,
    position: 'relative',
  },
  header: {
    position: 'absolute',
    top: 100,
    left: 25,
    right: 25,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
  },
  circle1: {
    position: 'absolute',
    top: -70,
    left: -40,
    width: 345,
    height: 345,
    borderRadius: 225,
    backgroundColor: NAVY,
    zIndex: 10,
  },
  circle2: {
    position: 'absolute',
    top: 90,
    left: 200,
    width: 178,
    height: 178,
    borderRadius: 200,
    backgroundColor: NAVY,
    zIndex: 11,
  },
  circle3: {
    position: 'absolute',
    top: 210,
    left: -60,
    width: 165,
    height: 165,
    borderRadius: 160,
    backgroundColor: NAVY,
    zIndex: 12,
  },
  bottomCircle: {
    position: 'absolute',
    bottom: -30,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: NAVY,
    zIndex: 1,
  },
  logo: {
    width: 330,
    height: 140,
    resizeMode: 'contain',
    marginLeft: -110,
  },
  smartText: {
    fontSize: 50,
    color: '#FFFFFF',
    fontFamily: 'Genos-SemiBold',
    fontWeight: '400',
    marginLeft: -80,
    letterSpacing: 3,
  },
  content: {
    paddingTop: 380,
    justifyContent: 'center',
  },
  loginText: {
    fontSize: 24,
    fontFamily: 'Inter-Regular',
    fontWeight: '700',
    alignSelf: 'center',
    marginBottom: 20,
    color: '#000',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 15,
  },
  icon: {
    width: 25,
    height: 25,
    marginRight: 10,
    resizeMode: 'contain',
    tintColor: '#111827',
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
    color: '#000',
    fontFamily: 'Inter',
    fontWeight: '400',
  },
  eyeIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
    tintColor: '#6B7280',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: '#111827',
    marginRight: 8,
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  checkboxChecked: {
    backgroundColor: '#111827',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
    fontFamily: 'Inter',
    fontWeight: '400',
  },
  forgotPassword: {
    fontSize: 14,
    color: '#666',
    textDecorationLine: 'underline',
    fontFamily: 'Genos',
    fontWeight: '400',
  },
  loginButton: {
    backgroundColor: '#FCB316',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  loginButtonText: {
    fontSize: 17,
    color: '#000',
    fontFamily: 'Inter',
    fontWeight: '700',
  },
});
