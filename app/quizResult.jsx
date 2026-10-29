import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import LottieView from "lottie-react-native";
import colors from "../theme/colors";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const radius = 95;
const strokeWidth = 14;
const circumference = 2 * Math.PI * radius;

const QuizResultScreen = () => {
  const params = useLocalSearchParams();
  const router = useRouter();

  const correct = Number(params.score ?? 0);
  const total = Number(params.total ?? 0);
  const percent = Number.isFinite(Number(params.percentage))
    ? Math.min(Math.max(Math.round(Number(params.percentage)), 0), 100)
    : 0;

  const asNumber = (value) => {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const awardedPointsRaw = asNumber(params.awardedPoints);
  const awardedPoints = Math.max(0, awardedPointsRaw ?? 0);
  const newBalance = asNumber(params.newBalance);
  const awardPending = params.awardPending === "1";
  const quizTitle = params.title ? String(params.title) : null;
  const quizData = params.quizData;

  const isPassing = percent >= 60;
  const showConfetti = percent >= 50;

  const feedbackText = useMemo(() => {
    if (percent >= 80) return "Great job! 🌱";
    if (percent >= 50) return "Nice work — keep growing.";
    return "Good try — review and try again!";
  }, [percent]);

  const cardBackground = percent >= 60 ? "#E8F5E9" : "#FDECEA";

  const progressAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    contentAnim.setValue(0);
    Animated.timing(contentAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [contentAnim, percent]);

  useEffect(() => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: percent / 100,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percent, progressAnim]);

  useEffect(() => {
    const announcement = `Quiz completed, ${percent} percent. ${correct} out of ${total} correct.`;
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [percent, correct, total]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <View style={styles.container}>
        {showConfetti && (
          <LottieView
            source={require("../assets/animations/confetti.json")}
            autoPlay
            loop={false}
            style={styles.confetti}
          />
        )}

        <Animated.View
          style={[
            styles.resultCard,
            { backgroundColor: cardBackground, opacity: contentAnim },
          ]}
        >
          <View style={styles.ringWrapper}>
            <Svg
              width={(radius + strokeWidth) * 2}
              height={(radius + strokeWidth) * 2}
            >
              <Circle
                cx={radius + strokeWidth}
                cy={radius + strokeWidth}
                r={radius}
                stroke="#D7F2DE"
                strokeWidth={strokeWidth}
                fill="none"
              />
              <AnimatedCircle
                cx={radius + strokeWidth}
                cy={radius + strokeWidth}
                r={radius}
                stroke="#2E7D32"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                fill="none"
                rotation="-90"
                originX={radius + strokeWidth}
                originY={radius + strokeWidth}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffset}
              />
            </Svg>
            <View style={styles.ringContent}>
              <Text style={styles.percentage}>{percent}%</Text>
            </View>
          </View>

          <Text style={styles.title}>Quiz Completed</Text>
          {quizTitle ? (
            <Text style={styles.quizTitle}>{quizTitle}</Text>
          ) : null}
          <Text style={styles.subtitle}>
            You scored {correct} / {total}.
          </Text>
          <Text style={styles.pointsHeadline}>
            You earned {awardedPoints} {awardedPoints === 1 ? "point" : "points"} 🎉
          </Text>
          {awardPending ? (
            <Text style={styles.syncNotice}>
              Points will be synced when you're online.
            </Text>
          ) : null}
          {newBalance !== null ? (
            <Text style={styles.balanceText}>New balance: {newBalance}</Text>
          ) : null}
          <View style={styles.statRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Correct</Text>
              <Text style={styles.statValue}>{correct}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Total</Text>
              <Text style={styles.statValue}>{total}</Text>
            </View>
          </View>
          <Text style={styles.feedback}>{feedbackText}</Text>
        </Animated.View>

        <Animated.View
          style={[styles.buttonWrapper, styles.buttonWrapperLast, { opacity: contentAnim }]}
        >
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={() => router.push("/LearningPage")}
          >
            <Text style={styles.primaryLabel}>Back to Home</Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    backgroundColor: colors.neutral.white,
    alignItems: "center",
  },
  confetti: {
    position: "absolute",
    top: 0,
    width: 260,
    height: 260,
  },
  resultCard: {
    width: "85%",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  ringWrapper: {
    marginBottom: 20,
  },
  ringContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  percentage: {
    fontSize: 42,
    fontWeight: "800",
    color: "#2E7D32",
    textAlign: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  quizTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#455A64",
    marginTop: 6,
    textAlign: "center",
  },
  pointsHeadline: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.eco.green[600],
    marginTop: 8,
    textAlign: "center",
  },
  syncNotice: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: "center",
  },
  balanceText: {
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 6,
    textAlign: "center",
  },
  feedback: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
    textAlign: "center",
  },
  statRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  statBlock: {
    alignItems: "center",
    paddingHorizontal: 12,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  statValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
    marginHorizontal: 12,
  },
  buttonWrapper: {
    width: "85%",
    marginBottom: 16,
  },
  buttonWrapperLast: {
    marginBottom: 0,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#2E7D32",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "rgba(46,125,50,0.35)",
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryButtonPressed: {
    backgroundColor: "#1B5E20",
  },
  primaryLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.neutral.white,
  },
});

export default QuizResultScreen;
