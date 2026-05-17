import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { Swipeable } from 'react-native-gesture-handler';

/* ───────── types ───────── */
type Props = NativeStackScreenProps<RootStackParamList, 'Announcements'>;

type Announcement = {
  id: string;
  title: string;
  from: string;
  dateISO: string;
  content: string;
  attachment?: string;
};

/* ───────── constants ───────── */
const NAVY = '#020120';
const BLUE = '#3C62D8';
const TEXT_DARK = '#0F172A';

/* ───────── helpers ───────── */
const tsToIsoDate = (ts: any) => {
  try {
    if (!ts) return new Date().toISOString().split('T')[0];
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString().split('T')[0];
    if (ts instanceof Date) return ts.toISOString().split('T')[0];
    return String(ts).split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

/* ───────── Item Component (FIXED PART) ───────── */
const AnnouncementItem = ({
  item,
  isRead,
  onMarkRead,
}: {
  item: Announcement;
  isRead: boolean;
  onMarkRead: () => void;
}) => {
  const swipeRef = useRef<Swipeable>(null);

  const prettyDate = new Date(item.dateISO).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={() => (
        <TouchableOpacity
          style={styles.swipeAction}
          activeOpacity={0.85}
          onPress={() => {
            onMarkRead();
            swipeRef.current?.close();
          }}
        >
          <Text style={styles.swipeText}>Mark as Read</Text>
        </TouchableOpacity>
      )}
      overshootRight={false}
      rightThreshold={40}
    >
      <View style={[styles.card, isRead && { opacity: 0.55 }]}>
        <View style={styles.row}>
          <Image source={require('./assets/marketing.png')} style={styles.rowIcon} />
          <Text style={styles.kvLabel}>Title:</Text>
          <Text style={styles.kvValue} numberOfLines={1}> {item.title}</Text>
        </View>

        <View style={styles.row}>
          <Image source={require('./assets/pin.png')} style={styles.rowIcon} />
          <Text style={styles.kvLabel}>From:</Text>
          <Text style={styles.kvValue} numberOfLines={1}> {item.from}</Text>
        </View>

        <View style={styles.row}>
          <Image source={require('./assets/calendar.png')} style={styles.rowIcon} />
          <Text style={styles.kvLabel}>Date:</Text>
          <Text style={styles.kvValue}> {prettyDate}</Text>
        </View>

        <View style={[styles.row, { marginTop: 8 }]}>
          <Image source={require('./assets/comment.png')} style={styles.rowIcon} />
          <Text style={styles.kvLabel}>Message:</Text>
        </View>

        <Text style={styles.msg}>{item.content}</Text>

        {item.attachment && (
          <TouchableOpacity
            style={[styles.row, { marginTop: 12 }]}
            onPress={() => Linking.openURL(item.attachment!)}
          >
            <Image source={require('./assets/ppclip.png')} style={styles.rowIcon} />
            <Text style={[styles.kvValue, { color: BLUE }]} numberOfLines={1}>
              {item.attachment.split('/').pop()}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Swipeable>
  );
};

/* ───────── Main Screen ───────── */
const AnnouncementsScreen: React.FC<Props> = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const mapAnnouncement = (
    doc: FirebaseFirestoreTypes.DocumentSnapshot
  ): Announcement => {
    const d = doc.data() as any;
    return {
      id: doc.id,
      title: d?.title || 'Untitled Announcement',
      from: d?.createdByName || d?.createdBy || 'Unknown Sender',
      dateISO: tsToIsoDate(d?.createdAt),
      content: d?.content || d?.message || 'No content provided.',
      attachment: typeof d?.attachment === 'string' ? d.attachment : undefined,
    };
  };

  useEffect(() => {
    const unsub = firestore()
      .collection('announcements')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        setAnnouncements(snap.docs.map(mapAnnouncement));
        setLoading(false);
      });

    return () => unsub();
  }, []);

  const renderItem = ({ item }: { item: Announcement }) => (
    <AnnouncementItem
      item={item}
      isRead={readIds.has(item.id)}
      onMarkRead={() =>
        setReadIds(prev => new Set(prev).add(item.id))
      }
    />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.screenTitle}>Announcements</Text>

      {loading ? (
        <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={it => it.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No announcements yet.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
};

export default AnnouncementsScreen;



 
/* ---------------- styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  /* header (copy of your Dashboard header look) */
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
    fontSize: 45,
    color: '#fff',
    fontFamily: 'Genos-SemiBold',
    fontWeight: '400',
    letterSpacing: 0.5,
    marginLeft: 4,
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

  /* page title under header */
  screenTitle: {
    textAlign: 'center',
    color: TEXT_DARK,
    fontSize: 27,
   fontFamily: 'Genos-SemiBold',
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },

  /* card + rows exactly like the screenshot */
  card: {
    backgroundColor: BLUE,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  rowIcon: { width: 18, height: 18, resizeMode: 'contain', marginRight: 6, marginLeft: 2 },
  kvLabel: { color: '#E6EBFF', fontWeight: '700' },
  kvValue: { color: '#FFFFFF', fontWeight: '500', flexShrink: 1 },
  msg: { color: '#FFFFFF', lineHeight: 20, marginTop: 2 },

  empty: { color: '#6B7280', textAlign: 'center', marginTop: 24 },
  
  backRowWrap: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderBottomWidth: 0,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  backText: {
    fontSize: 18,
    color: NAVY,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
    swipeAction: {
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
    width: 120,
    marginVertical: 8,
    borderRadius: 14,
  },
  swipeText: { color: '#fff', fontWeight: '800' },
  
});

