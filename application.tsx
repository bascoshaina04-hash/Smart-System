// application.tsx
import 'react-native-gesture-handler'; // <-- REQUIRED for Swipeable gestures to work

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Screens
import LoginScreen from './App';
import Dashboard from './Dashboard';
import ReportForm from './ReportForm';
import HistoryScreen from './HistoryScreen';
import AnnouncementsScreen from './AnnouncementsScreen';
import ProfileScreen from './ProfileScreen';
import StudentDashboard from './StudentDashboard';

import FacultyDashboard from './FacultyDashboard';
import FacultyReportForm from './FacultyReportForm';
import FacultyReportStatus from './FacultyReportStatus';
import FacultyAnnouncements from './FacultyAnnouncements';

import StudentAppointments from './StudentAppointments';
import StudentRequestDocs from './StudentRequestDocs';
import StudentViolations from './StudentViolations';
import StudentStatus from './StudentStatus';
import StudentConsultation from './StudentConsultation';
import StudentSpecialPass from './StudentSpecialPass';
import SpecialPassList from './SpecialPassList';


export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  ReportForm: undefined;
  History: undefined;
  Announcements: undefined;
  Profile: undefined;
  SpecialPassList: undefined;

  // Faculty
  FacultyDashboard: undefined;
  FacultyReportForm: undefined;
  FacultyReportStatus: undefined;
  FacultyAnnouncements: undefined;

  // Student side
  StudentDashboard: { displayName?: string } | undefined;
  StudentProfile: undefined;
  StudentAppointments: undefined;
  StudentRequestDocs: undefined;
  StudentViolations: undefined;
  StudentStatus: undefined;
  StudentConsultation: undefined;
  StudentSpecialPass: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Application() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {/* Admin/Guard side */}
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Dashboard" component={Dashboard} />
          <Stack.Screen name="ReportForm" component={ReportForm} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="Announcements" component={AnnouncementsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="SpecialPassList"component={SpecialPassList}
/>
          {/* Student side */}
          <Stack.Screen name="StudentDashboard" component={StudentDashboard} />
          <Stack.Screen name="StudentAppointments" component={StudentAppointments} />
          <Stack.Screen name="StudentRequestDocs" component={StudentRequestDocs} />
          <Stack.Screen name="StudentViolations" component={StudentViolations} />
          <Stack.Screen name="StudentStatus" component={StudentStatus} />
          <Stack.Screen name="StudentConsultation" component={StudentConsultation} />
          <Stack.Screen name="StudentSpecialPass" component={StudentSpecialPass} />
        

          {/* Faculty side */}
          <Stack.Screen name="FacultyDashboard" component={FacultyDashboard} />
          <Stack.Screen name="FacultyReportForm" component={FacultyReportForm} />
          <Stack.Screen name="FacultyReportStatus" component={FacultyReportStatus} />
          <Stack.Screen name="FacultyAnnouncements" component={FacultyAnnouncements} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
