import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Platform, StatusBar as RNStatusBar, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { StatusBar } from "expo-status-bar";

import { HapticsProvider } from "../context/HapticsContext";
import { TrackingProvider } from "../context/TrackingContext";
import { TrackingDataProvider } from "../context/TrackingDataContext";
import { UserProvider } from "../context/UserContext";
import { getSeenIntro } from "../lib/storage/firstRun";
import colors from "../theme/colors";
import { toastConfig } from "../utils/toastConfig";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const evaluateIntroState = async () => {
      try {
        const hasSeenIntro = await getSeenIntro();
        if (!isMounted) {
          return;
        }

        const isIntroRoute = segments?.[0] === "(intro)";

        if (hasSeenIntro && isIntroRoute) {
          setReady(false);
          router.replace("/");
          return;
        }

        if (!hasSeenIntro && !isIntroRoute) {
          setReady(false);
          router.replace("/(intro)/intro");
          return;
        }

        setReady(true);
      } catch (error) {
        if (__DEV__) {
          console.warn("[RootLayout] intro guard failed", error);
        }
        if (isMounted) {
          setReady(true);
        }
      }
    };

    evaluateIntroState();

    return () => {
      isMounted = false;
    };
  }, [segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <UserProvider>
          <HapticsProvider>
            <TrackingDataProvider>
              <TrackingProvider>
                <SafeAreaShell>
                  <View style={styles.container}>
                    {ready ? <Slot /> : null}
                  </View>
                </SafeAreaShell>
              </TrackingProvider>
            </TrackingDataProvider>
          </HapticsProvider>
        </UserProvider>
      </SafeAreaProvider>
      <Toast config={toastConfig} />
    </GestureHandlerRootView>
  );
}

/**
 * Pads the app by the system insets. On Android edge-to-edge the reported top
 * inset can be 0 before the first layout pass (notably in Expo Go), which pushes
 * page titles under the status bar, so fall back to the status bar height.
 */
function SafeAreaShell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const top =
    Platform.OS === "android"
      ? Math.max(insets.top, RNStatusBar.currentHeight ?? 0)
      : insets.top;
  return (
    <View
      style={[
        styles.safeAreaShell,
        {
          paddingTop: top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeAreaShell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // androidSafeArea: {
  //   paddingTop: 12,
  //   paddingBottom: 4,
  // },
});

