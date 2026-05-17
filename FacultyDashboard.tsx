// FacultyDashboard.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import { Swipeable } from 'react-native-gesture-handler';

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

type Nav = NativeStackNavigationProp<RootStackParamList, 'FacultyDashboard'>;

export default function FacultyDashboard() {
  const navigation = useNavigation<Nav>();

  // faculty name
  const [facultyName, setFacultyName] = useState('Ma’am');

  // dashboard counts
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [announcementCount, setAnnouncementCount] = useState(0);

  /* ───────── Faculty name ───────── */
  useEffect(() => {
    const uid = auth().currentUser?.uid;
    if (!uid) return;

    firestore()
      .collection('users')
      .doc(uid)
      .get()
      .then(doc => {
         if (doc.exists()) { 
          const data = doc.data();
          setFacultyName(
            data?.fullName ||
            data?.name ||
            data?.firstName ||
            data?.displayName ||
            'Ma’am'
          );
        }
      })
      .catch(err => console.log('Faculty name fetch error:', err));
  }, []);

  /* ───────── Unresolved violations (REAL TIME) ───────── */
  useEffect(() => {
    const uid = auth().currentUser?.uid;
    if (!uid) return;

    const unsub = firestore()
      .collection('violations')
      .where('createdByRole', '==', 'faculty')
      .where('createdByUid', '==', uid)
      .where('status', '==', 'open')
      .onSnapshot(snapshot => {
        setUnresolvedCount(snapshot.size);
      });

    return () => unsub();
  }, []);

  /* ───────── Announcements (REAL DATA – FIXED) ───────── */
  useEffect(() => {
    const unsub = firestore()
      .collection('announcements')
      .where('visibility', 'in', ['All Faculty', 'All'])
      .onSnapshot(snapshot => {
        setAnnouncementCount(snapshot.size);
      });

    return () => unsub();
  }, []);

  /* ───────── Swipe Action UI ───────── */
  const swipeAction = (onPress: () => void, label: string) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: '#020120',
        justifyContent: 'center',
        paddingHorizontal: 20,
        borderRadius: 16,
        marginVertical: 4,
      }}
    >
      <Text style={{ color: '#FFF', fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('./assets/shieldlogo.png')} style={styles.logo} />
          <Text style={styles.appName}>Smart</Text>
        </View>

        <TouchableOpacity
          style={styles.profileCircle}
          onPress={() => navigation.navigate('Profile')}
        >
          <Image source={require('./assets/profileblue.png')} style={styles.profileIcon} />
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.greetingText}>Hi {facultyName}!</Text>

        {/* Unresolved cases */}
        <Swipeable
          renderRightActions={() =>
            swipeAction(() => navigation.navigate('FacultyReportStatus'), 'View')
          }
        >
          <View style={styles.infoCardRow}>
            <View style={styles.infoCard}>
              <View style={styles.infoLeft}>
                <View style={styles.statusIconBox}>
                  <Image
                    source={require('./assets/black_warning.png')}
                    style={styles.statusIconImage}
                  />
                </View>
                <Text style={styles.infoMain}>Resolved Cases</Text>
              </View>
              <View style={styles.infoRightRow}>
                <Text style={styles.infoNumber}>{unresolvedCount}</Text>
                <Text style={styles.infoPillText}>unresolved</Text>
              </View>
            </View>
          </View>
        </Swipeable>

        {/* Announcements */}
        <Swipeable
          renderRightActions={() =>
            swipeAction(() => navigation.navigate('FacultyAnnouncements'), 'Open')
          }
        >
          <View style={styles.infoCardRow}>
            <View style={styles.infoCard}>
              <View style={styles.infoLeft}>
                <View style={styles.statusIconBox}>
                  <Image
                    source={require('./assets/black_megaphone.png')}
                    style={styles.statusIconImage}
                  />
                </View>
                <Text style={styles.infoMain}>Announcements</Text>
              </View>
              <View style={styles.infoRightRow}>
                <Text style={styles.infoNumber}>{announcementCount}</Text>
                <Text style={styles.infoPillText}>new</Text>
              </View>
            </View>
          </View>
        </Swipeable>

        {/* Grid buttons */}
        <View style={styles.gridRow}>
          <TouchableOpacity
            style={styles.featureCard}
            onPress={() => navigation.navigate('FacultyReportForm')}
          >
            <Image source={require('./assets/warning.png')} style={styles.featureIcon} />
            <Text style={styles.featureLabel}>Report Violation</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.featureCard}
            onPress={() => navigation.navigate('FacultyReportStatus')}
          >
            <Image source={require('./assets/home.png')} style={styles.featureIcon} />
            <Text style={styles.featureLabel}>Report Status</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.featureCard}
            onPress={() => navigation.navigate('FacultyAnnouncements')}
          >
            <Image source={require('./assets/megaphone.png')} style={styles.featureIcon} />
            <Text style={styles.featureLabel}>Announcements</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.featureCard}
            onPress={() => navigation.navigate('Profile')}
          >
            <Image source={require('./assets/avatar.png')} style={styles.featureIcon} />
            <Text style={styles.featureLabel}>Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ───────── Styles (UNCHANGED) ───────── */

// styles
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  /* HEADER */
  header: {
    backgroundColor: '#020120',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logo: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },

  appName: {
    fontSize: 45,
    color: '#fff',
    fontFamily: 'Genos-SemiBold',
    fontWeight: '400',
    letterSpacing: 0.5,
  },

  profileCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    tintColor: '#fff',
  },

  /* BODY */
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  greetingText: {
    fontSize: 33,
    fontFamily: 'Genos-SemiBold',
    fontWeight: '500',
    color: '#0F172A',
    marginLeft:15,
    marginTop:23,
    marginBottom: 40,
  },

  /* INFO CARDS */
  infoCardRow: {
    marginBottom: 8,
  },
  infoCard: {
    marginLeft:17,
    backgroundColor: '#EBEBEB',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation:9,
    width:'90%',
  },

  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // NEW: gray rounded box behind small icon
  statusIconBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  statusIconImage: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: '#000', // icons are already black, this is just safety
  },

  infoMain: {
    fontSize: 19,
    color: '#000',
    fontWeight: '600',
  },

  infoRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoNumber: {
    fontSize: 19,
    fontWeight: '600',
    color: '#000',
    marginRight: 6,
  },
 
  infoPillText: {
    color: '#000',
    fontSize:18,
    fontWeight: '500',
  },

  /* GRID BUTTONS */
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    rowGap: 3, // RN 0.71+
    marginTop: 35,
  },

  featureCard: {
    width: 150, // two per row
    marginBottom: 16,
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

  featureIcon: {
    width: 50,
    height: 50,
    resizeMode: 'contain',
  },

  featureLabel: {
    color: '#fff',
    fontSize: 15,
    fontFamily:'Inter',
    fontWeight: '700',
    letterSpacing:.5,
  },
    /* 🔹 Modal styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalCard: {
    width: '85%',
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
  },

  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FCB316',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },

  modalIcon: {
    width: 32,
    height: 32,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#020120',
    marginBottom: 6,
  },

  modalMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 22,
  },

  modalButton: {
    backgroundColor: '#020120',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 25,
  },

  modalButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
});


