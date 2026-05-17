import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  SafeAreaView,
  Image,
  StyleSheet,
  TouchableOpacity
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';

type Props = NativeStackScreenProps<RootStackParamList, 'SpecialPassList'>;

type SpecialPass = {
  id: string;
  studentName: string;
  course: string;
  studentId: string;
  startDate?: string;
  expirationDate?: string;
};
const NAVY = '#020120';
const BLUE = '#6178d3';
const CARD = '#F2F4F7';
const TEXT_DARK = '#0F172A';
const SpecialPassList: React.FC<Props> = ({navigation}) => {

  const [passes, setPasses] = useState<SpecialPass[]>([]);

  useEffect(()=>{

    const unsubscribe = firestore()
      .collection('specialPassRequests')
      .where('status','==','approved')
      .onSnapshot(snapshot=>{

      const data = snapshot.docs.map(doc => {

  const d:any = doc.data();

  return {
    id: doc.id,
    studentName: d.studentName,
    course: d.course,
    studentId: d.studentId,
    startDate: d.startDate?.toDate()?.toLocaleDateString('en-GB'),
    expirationDate: d.expirationDate?.toDate()?.toLocaleDateString('en-GB')
  };

});
        setPasses(data);

      });

    return unsubscribe;

  },[]);

  return(

    <SafeAreaView style={styles.safe}>

      {/* HEADER */}
      <View style={styles.header}>

        <View style={styles.brandWrap}>
          <Image
            source={require('./assets/shieldlogo.png')}
            style={styles.brandLogo}
          />
          <Text style={styles.brandText}>Smart</Text>
        </View>

        <TouchableOpacity
          style={styles.profileBubble}
          onPress={()=>navigation.navigate('Profile')}
        >
          <Image
            source={require('./assets/profileblue.png')}
            style={styles.profileIcon}
          />
        </TouchableOpacity>

      </View>

      {/* TITLE */}
      <Text style={styles.title}>Approved Special Pass</Text>

      {/* LIST */}
      <FlatList
        data={passes}
        keyExtractor={(item)=>item.id}
        contentContainerStyle={{padding:15}}
        renderItem={({item})=>(

          <View style={styles.card}>

            <Image
              source={require('./assets/files.png')}
              style={styles.icon}
            />

            <View style={{flex:1}}>

              <Text style={styles.name}>
                {item.studentName}
              </Text>
<Text style={styles.details}>
  {item.course} | ID: {item.studentId}
</Text>

{item.startDate && item.expirationDate && (
  <Text style={{fontSize:12,color:'#6b7280'}}>
    Valid: {item.startDate} - {item.expirationDate}
  </Text>
)}
            </View>

          </View>

        )}
      />

    </SafeAreaView>

  );

};

export default SpecialPassList;


/* ---------------------- STYLES ---------------------- */

const styles = StyleSheet.create({

safe:{
flex:1,
backgroundColor:'#fff'
},

header:{
flexDirection:'row',
justifyContent:'space-between',
alignItems:'center',
backgroundColor:NAVY,
padding:15
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

profileIcon:{ width: 18, height: 18, resizeMode: 'contain', tintColor: '#fff' },

title:{
fontSize:20,
fontWeight:'bold',
marginTop:15,
marginLeft:15
},

card:{
flexDirection:'row',
alignItems:'center',
backgroundColor:CARD,
padding:15,
borderRadius:10,
marginBottom:10
},

icon:{
width:50,
height:50,
marginRight:10
},

name:{
fontWeight:'bold',
fontSize:20
},


details:{
fontSize:20,
color:'#44464a'              
}

});
