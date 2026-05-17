import React, { useState } from "react";
import {
View,
Text,
Image,
TextInput,
Pressable,
StyleSheet,
SafeAreaView,
} from "react-native";

export default function App() {
const [remember, setRemember] = useState(false);
const [secure, setSecure] = useState(true);

return (
<SafeAreaView style={styles.safe}>
{/* background blobs */}
<View style={[styles.blob, styles.blobTopLeft]} />
<View style={[styles.blob, styles.blobBottomRight]} />

      <View style={styles.container}>
        {/* logo + brand */}
        <View style={styles.header}>
          <Image
            source={require("./assets/shieldlogonobackground.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brand}>Smart</Text>
        </View>

        <Text style={styles.title}>Login</Text>

        {/* username */}
        <View style={styles.inputWrap}>
          <Image source={require("./assets/user.png")} style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
          />
        </View>

        {/* password */}
        <View style={styles.inputWrap}>
          <Image source={require("./assets/lock.png")} style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#6B7280"
            secureTextEntry={secure}
          />
          <Pressable onPress={() => setSecure(!secure)} style={styles.eyeBtn}>
            <Image
              source={require("./assets/eyesclose.png")}
              style={styles.eyeIcon}
              resizeMode="contain"
            />
          </Pressable>
        </View>

        {/* options row */}
        <View style={styles.row}>
          <Pressable
             onPress={() => setRemember(!remember)}
             style={styles.remember}
          >
            <View style={[styles.checkbox, remember && styles.checkboxChecked]} />
            <Text style={styles.rememberText}>Remember me</Text>
          </Pressable>

          <Pressable>
            <Text style={styles.link}>Forgot Password?</Text>
          </Pressable>
        </View>

        {/* login button */}
        <Pressable style={styles.loginBtn}>
          <Text style={styles.loginText}>Login</Text>
        </Pressable>
      </View>
    </SafeAreaView>
);
}

const NAVY = "#0B0D3B";
const ORANGE = "#f9a825"; // warm button color
const CARD = "#E5E7EB";   // input background

const styles = StyleSheet.create({
safe: { flex: 1, backgroundColor: "#F5F6F8" },
container: {
flex: 1,
paddingHorizontal: 24,
justifyContent: "flex-start",
},

/* background shapes */
blob: {
position: "absolute",
width: 260,
height: 260,
backgroundColor: NAVY,
borderRadius: 260,
},
blobTopLeft: { top: -80, left: -80 },
blobBottomRight: { bottom: -70, right: -70 },

header: {
flexDirection: "row",
alignItems: "center",
marginTop: 24,
marginBottom: 28,
},
logo: { width: 64, height: 64, marginRight: 10 },
brand: {
fontSize: 40,
color: "#ffffff",
// the dark blob sits behind; put brand above it in white or dark depending on your design.
// If you prefer dark text, change to NAVY and move header downward from the blob.
fontFamily: "Genos", // ensure Genos is linked; no bold used
fontWeight: "400",
textShadowColor: "rgba(0,0,0,0.12)",
textShadowRadius: 2,
},

title: {
marginTop: 40,
marginBottom: 16,
fontSize: 24,
color: "#111827",
fontFamily: "Genos",
fontWeight: "400",
},

inputWrap: {
flexDirection: "row",
alignItems: "center",
backgroundColor: CARD,
borderRadius: 12,
paddingHorizontal: 12,
height: 48,
marginBottom: 12,
},
icon: { width: 20, height: 20, tintColor: "#111827", marginRight: 8 },
input: {
flex: 1,
fontSize: 16,
color: "#111827",
fontFamily: "Genos",
fontWeight: "400",
},
eyeBtn: { paddingHorizontal: 6, paddingVertical: 6 },
eyeIcon: { width: 22, height: 22, tintColor: "#6B7280" },

row: {
marginTop: 4,
marginBottom: 18,
flexDirection: "row",
alignItems: "center",
justifyContent: "space-between",
},
remember: { flexDirection: "row", alignItems: "center" },
checkbox: {
width: 18,
height: 18,
borderRadius: 3,
borderWidth: 1.5,
borderColor: "#111827",
marginRight: 8,
backgroundColor: "#fff",
},
checkboxChecked: { backgroundColor: "#111827" },
rememberText: {
fontSize: 14,
color: "#111827",
fontFamily: "Genos",
fontWeight: "400",
},
link: {
fontSize: 14,
color: NAVY,
textDecorationLine: "none",
fontFamily: "Genos",
fontWeight: "400",
},

loginBtn: {
backgroundColor: ORANGE,
height: 48,
borderRadius: 12,
alignItems: "center",
justifyContent: "center",
elevation: 1,
},
loginText: {
fontSize: 18,
color: "#111827",
fontFamily: "Genos",
fontWeight: "400",
},
});
