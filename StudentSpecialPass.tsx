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
Modal
} from 'react-native';

import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { launchImageLibrary } from 'react-native-image-picker';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './application';

type Props = NativeStackScreenProps<RootStackParamList,'StudentSpecialPass'>;

/* ---------------- theme ---------------- */

const NAVY='#020120';
const CARD_BG='#0B0D3B';
const INPUT_BG='#FFFFFF';
const PLACEHOLDER='#7A7F87';
const TEXT_DARK='#0F172A';
const GREEN='#16a34a';

/* ---------------- dropdown options ---------------- */

const REASON_TYPES=[
'Pregnancy',
'Religious Belief',
'Medical Condition',
'Physical Disability',
'Other'
];  

/* ---------------- student resolver ---------------- */

const resolveCurrentStudent=async()=>{

const authUser=auth().currentUser;
const raw=await AsyncStorage.getItem('currentUser');
const parsed:any=raw?JSON.parse(raw):null;

const savedStudentID=(await AsyncStorage.getItem('currentStudentID'))||'';
const savedCourse=(await AsyncStorage.getItem('currentStudentCourse'))||'';

const emailLocal=((authUser?.email||'').split('@')[0]||'').trim();

const candidateIds=[
savedStudentID,
String(parsed?.id||''),
String(parsed?.uid||''),
emailLocal
]
.map(s=>s.trim())
.filter(Boolean);

const FIELDS=[
'studentID','student_id','studentNumber','idNumber','sid','uid','id','ID'
];

let found:any=null;

for(const cid of candidateIds){

const snap=await firestore().collection('students').doc(cid).get();

if(snap.exists()){
found=snap.data();
break;
}

}

if(!found){

outer:for(const cid of candidateIds){

for(const f of FIELDS){

const qs=await firestore()
.collection('students')
.where(f,'==',cid)
.limit(1)
.get();

if(!qs.empty){
found=qs.docs[0].data();
break outer;
}

}

}

}

const studentID=
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

return{

studentID:String(studentID).trim(),

studentName:
found?.fullName ??
found?.name ??
authUser?.displayName ??
((authUser?.email || '').split('@')[0]) ??
'Student',

course:
found?.course ??
found?.program ??
found?.degree ??
savedCourse ??
'',

courseSection:
found?.courseSection ??
found?.section ??
''

};

};

/* ---------------- component ---------------- */

const StudentSpecialPass:React.FC<Props>=({navigation})=>{

const[studentName,setStudentName]=useState('');
const[studentId,setStudentId]=useState('');
const[courseSection,setCourseSection]=useState('');

const[reasonType,setReasonType]=useState('');
const[reasonDetails,setReasonDetails]=useState('');

const[note,setNote]=useState('');
const[evidence,setEvidence]=useState<any>(null);

const[reasonOpen,setReasonOpen]=useState(false);
const[saving,setSaving]=useState(false);

/* ---------------- load student ---------------- */

useEffect(()=>{

(async()=>{

try{

const who=await resolveCurrentStudent();

setStudentName(who.studentName||'');
setStudentId(who.studentID||'');
setCourseSection(who.courseSection||who.course||'');

}catch(e){

Alert.alert(
'Profile not found',
'Unable to load your student profile.'
);

}

})();

},[]);

/* ---------------- evidence picker ---------------- */

const pickEvidence=()=>{

launchImageLibrary(
{mediaType:'photo',quality:0.7},
(response)=>{

if(response.didCancel) return;

if(response.assets && response.assets.length>0){
setEvidence(response.assets[0]);
}

});

};

/* ---------------- submit ---------------- */

const onSubmit=async()=>{

if(!reasonType || !reasonDetails){

Alert.alert('Missing info','Please complete all required fields.');
return;

}

const uid=auth().currentUser?.uid;

if(!uid){

Alert.alert('Not signed in','Please login again.');
return;

}

setSaving(true);

try{

await firestore()
.collection('specialPassRequests')
.add({

studentId,
studentName,
course:courseSection,

reasonType,
reasonDetails,

note:note || 'N/A',

evidence:evidence?.uri || null,

status:'pending',
office:'osa',

createdByUid:uid,
createdAt:firestore.FieldValue.serverTimestamp()

});

Alert.alert('Submitted','Your Special Pass request has been sent.');

setReasonType('');
setReasonDetails('');
setNote('');
setEvidence(null);

}catch(e:any){

Alert.alert('Error',e.message||'Submission failed.');

}finally{
setSaving(false);
}

};

/* ---------------- UI ---------------- */

return(

<SafeAreaView style={{flex:1,backgroundColor:'#fff'}}>

<View style={styles.header}>

<View style={styles.brandWrap}>
<Image source={require('./assets/shieldlogo.png')} style={styles.brandLogo}/>
<Text style={styles.brandText}>Smart</Text>
</View>

<TouchableOpacity
style={styles.profileBubble}
onPress={()=>navigation.navigate('Profile')}
>

<Image
source={require('./assets/profileblue.png')}
style={styles.profileIconSmall}
/>

</TouchableOpacity>

</View>

<ScrollView contentContainerStyle={{padding:16}}>

<View style={styles.card}>

<TouchableOpacity
style={styles.closeBtn}
onPress={()=>navigation.goBack()}
>
<Text style={{color:'#fff',fontWeight:'900'}}>✕</Text>
</TouchableOpacity>

<Text style={styles.title}>Special Pass Request</Text>

{/* Student Name */}

<View style={styles.inputWrap}>
<TextInput
style={[styles.input,{textAlign:'center'}]}
value={studentName}
placeholder="Full Name"
editable={false}
/>
</View>

{/* Course Section */}

<View style={styles.inputWrap}>
<TextInput
style={[styles.input,{textAlign:'center'}]}
value={courseSection}
placeholder="Course/Year & Section"
editable={false}
/>
</View>

{/* Student ID */}

<View style={styles.inputWrap}>
<TextInput
style={[styles.input,{textAlign:'center'}]}
value={studentId}
placeholder="Student ID"
editable={false}
/>
</View>

{/* Reason Dropdown */}

<TouchableOpacity
style={styles.inputWrap}
onPress={()=>setReasonOpen(true)}
>

<Text style={{
textAlign:'center',
fontWeight:'600',
color:reasonType ? TEXT_DARK : PLACEHOLDER
}}>
{reasonType || 'Reason for Special Pass'}
</Text>

</TouchableOpacity>

<View style={[styles.inputWrap,{height:90}]}>
<TextInput
style={[
styles.input,
{
height:'100%',
textAlign:'center',
textAlignVertical:'center'
}
]}
placeholder="Explain your request"
placeholderTextColor={PLACEHOLDER}
value={reasonDetails}
onChangeText={setReasonDetails}
multiline
/>
</View>

{/* Evidence */}

<TouchableOpacity
style={styles.inputWrap}
onPress={pickEvidence}
>

<Text style={{textAlign:'center'}}>
{evidence ? 'Evidence Selected' : 'Upload Evidence'}
</Text>

</TouchableOpacity>

{evidence && (

<Image
source={{uri:evidence.uri}}
style={{width:'100%',height:150,borderRadius:8,marginBottom:10}}
/>

)}

<View style={[styles.inputWrap,{height:80}]}>
<TextInput
style={[
styles.input,
{
height:'100%',
textAlign:'center',
textAlignVertical:'center'
}
]}
placeholder="Additional Note"
placeholderTextColor={PLACEHOLDER}
value={note}
onChangeText={setNote}
multiline
/>
</View>

<TouchableOpacity
style={[styles.submitBtn,saving && {opacity:0.6}]}
onPress={onSubmit}
disabled={saving}
>
<Text style={styles.submitText}>
{saving ? 'Submitting…' : 'Submit Request'}
</Text>
</TouchableOpacity>

</View>

</ScrollView>

{/* Dropdown Modal */}

<Modal transparent visible={reasonOpen} animationType="fade">

<TouchableOpacity
style={styles.modalBackdrop}
activeOpacity={1}
onPressOut={()=>setReasonOpen(false)}
>

<View style={styles.modalCard}>

<Text style={styles.modalTitle}>Select Reason</Text>

{REASON_TYPES.map((reason)=>(
<TouchableOpacity
key={reason}
style={styles.optRow}
onPress={()=>{
setReasonType(reason)
setReasonOpen(false)
}}
>

<Text style={styles.optText}>{reason}</Text>

</TouchableOpacity>
))}

</View>

</TouchableOpacity>

</Modal>

</SafeAreaView>

);

};

export default StudentSpecialPass;

/* ---------------- styles ---------------- */

const styles=StyleSheet.create({

header:{
flexDirection:'row',
alignItems:'center',
backgroundColor:NAVY,
paddingHorizontal:14,
paddingVertical:10
},

brandWrap:{
flexDirection:'row',
alignItems:'center',
flex:1
},

brandLogo:{
width:80,
height:80,
resizeMode:'contain'
},

brandText:{
fontSize:45,
color:'#fff',
fontFamily:'Genos-SemiBold'
},

profileBubble:{
width:34,
height:34,
borderRadius:17,
borderWidth:2,
borderColor:'#fff',
alignItems:'center',
justifyContent:'center'
},

profileIconSmall:{
width:18,
height:18,
tintColor:'#fff'
},

card:{
backgroundColor:CARD_BG,
borderRadius:12,
padding:16,
marginTop:16
},

closeBtn:{
position:'absolute',
right:10,
top:10,
backgroundColor:'#FF4D4F',
borderRadius:20,
paddingHorizontal:8
},

title:{
alignSelf:'center',
color:'#fff',
fontWeight:'900',
fontSize:20,
marginBottom:12
},

inputWrap:{
backgroundColor:INPUT_BG,
borderRadius:8,
height:50,
marginBottom:12,
paddingHorizontal:10,
justifyContent:'center'
},

input:{
color:TEXT_DARK,
fontSize:15
},

submitBtn:{
backgroundColor:GREEN,
paddingVertical:12,
borderRadius:10,
alignItems:'center'
},

submitText:{
color:'#fff',
fontWeight:'700'
},

modalBackdrop:{
flex:1,
justifyContent:'center',
backgroundColor:'rgba(0,0,0,0.3)',
padding:20
},

modalCard:{
backgroundColor:'#fff',
borderRadius:10,
padding:16
},

modalTitle:{
fontWeight:'700',
fontSize:16,
marginBottom:10,
textAlign:'center'
},

optRow:{
paddingVertical:12
},

optText:{
textAlign:'center',
fontWeight:'600'
}

});