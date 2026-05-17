    // Avatar.tsx
import React, { useEffect, useState } from 'react';
import { Image, ImageStyle } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Props = {
  uid?: string | null;
  size?: number;
  style?: ImageStyle;
  defaultAsset?: any;
};

export default function Avatar({ uid, size = 55, style, defaultAsset }: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!uid) {
      setUri(null);
      return;
    }
    const docExists = (snap: any): boolean => {
  if (!snap) return false;
  // if SDK exposes .exists() as a function
  if (typeof (snap as any).exists === 'function') {
    try { return !!(snap as any).exists(); } catch { return false; }
  }
  // otherwise treat .exists as boolean
  return !!(snap as any).exists;
};

    (async () => {
      try {
        const cacheKey = `profilePhotoCache:${uid}`;

        // 1) fast local cache
        const cached = await AsyncStorage.getItem(cacheKey);
        if (mounted && cached) {
          setUri(cached);
          return;
        }

        // 2) try users/{uid}
        try {
const userDoc = await firestore().collection('users').doc(uid).get();
if (mounted && docExists(userDoc)) {
  const data: any = userDoc.data();
            if (data?.photoBase64) {
              setUri(data.photoBase64);
              await AsyncStorage.setItem(cacheKey, data.photoBase64);
              return;
            }
          }
        } catch (e) {
          console.warn('Avatar: users doc read failed', e);
        }

        // 3) try students/{uid}
        try {
const studentDoc = await firestore().collection('students').doc(uid).get();
if (mounted && docExists(studentDoc)) {
  const data: any = studentDoc.data();
            if (data?.photoBase64) {
              setUri(data.photoBase64);
              await AsyncStorage.setItem(cacheKey, data.photoBase64);
              return;
            }
          }
        } catch (e) {
          console.warn('Avatar: students doc read failed', e);
        }

        // 4) fallback: auth profile photo (only for current user)
        const currentUid = auth().currentUser?.uid ?? null;
        if (currentUid === uid) {
          const authPhoto = auth().currentUser?.photoURL ?? null;
          if (authPhoto && mounted) {
            setUri(authPhoto);
            return;
          }
        }

        if (mounted) setUri(null);
      } catch (err) {
        console.warn('Avatar load error', err);
        if (mounted) setUri(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [uid]);

  const defaultImg = defaultAsset ?? require('./assets/profileblue.png');
  // put this above your component



  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' },
          style,
        ]}
      />
    );
  }

  return <Image source={defaultImg} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
}
