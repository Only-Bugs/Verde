import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import StorageService from "../../../services/storage";
import colors from "../../../theme/colors";
import styles from "./styles";

const ICON_MAP = {
  "Energy Wiz": { icon: "bolt", bg: "#22C55E" },
  "Green Thumb": { icon: "eco", bg: "#16A34A" },
  "Recycle Hero": { icon: "recycling", bg: "#F59E0B" },
  "Water Wise": { icon: "water-drop", bg: "#0EA5E9" },
  "Home Energy": { icon: "bolt", bg: "#22C55E" },
  "Sustainable Transport": { icon: "directions-bus", bg: "#0EA5E9" },
  "Food and Waste": { icon: "restaurant", bg: "#F59E0B" },
  default: { icon: "quiz", bg: colors.eco.blue },
};

// Case/whitespace-insensitive lookup so a topic renamed in the database
// doesn't silently fall back to the generic icon.
const ICON_BY_NORMALIZED_TITLE = Object.fromEntries(
  Object.entries(ICON_MAP).map(([title, data]) => [title.trim().toLowerCase(), data])
);

const resolveIcon = (title) =>
  ICON_BY_NORMALIZED_TITLE[String(title ?? "").trim().toLowerCase()] || ICON_MAP.default;

const DAY_MS = 24 * 60 * 60 * 1000;

const resolveQuizId = (quiz) =>
  quiz?.quiz_id ||
  quiz?.quizId ||
  quiz?.topic_id ||
  quiz?.topicId ||
  quiz?.title ||
  quiz?.topic_name ||
  null;

const QuizCard = ({ quiz }) => {
  const router = useRouter();
  const quizId = useMemo(() => resolveQuizId(quiz), [quiz]);
  const quizParams = useMemo(() => JSON.stringify(quiz), [quiz]);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(null);

  const isCompleted = quiz.status === "completed";
  const isInProgress = quiz.status === "in_progress";

  const buttonLabel = isCompleted
    ? "Completed"
    : cooldownActive
    ? "Come Back Tomorrow"
    : isInProgress
    ? "Continue Quiz"
    : "Start Quiz";

  useEffect(() => {
    let isMounted = true;
    const syncCooldown = async () => {
      if (!quizId) {
        if (isMounted) {
          setCooldownActive(false);
          setCooldownUntil(null);
        }
        return;
      }
      try {
        const timestamp = await StorageService.getQuizCompletionTimestamp(quizId);
        if (!isMounted) return;
        if (timestamp) {
          const expiresAt = timestamp + DAY_MS;
          if (expiresAt > Date.now()) {
            setCooldownActive(true);
            setCooldownUntil(expiresAt);
          } else {
            setCooldownActive(false);
            setCooldownUntil(null);
            await StorageService.clearQuizCompletionTimestamp(quizId);
          }
        } else {
          setCooldownActive(false);
          setCooldownUntil(null);
        }
      } catch (err) {
        console.error("[QuizCard] Failed to read quiz cooldown:", err);
        if (isMounted) {
          setCooldownActive(false);
          setCooldownUntil(null);
        }
      }
    };

    syncCooldown();

    return () => {
      isMounted = false;
    };
  }, [quizId]);

  const handlePress = useCallback(async () => {
    if (isCompleted) return;
    if (!quizId) {
      router.push({
        pathname: "/QuizScreen",
        params: { quiz: quizParams },
      });
      return;
    }

    try {
      const timestamp = await StorageService.getQuizCompletionTimestamp(quizId);
      const expiresAt = timestamp ? timestamp + DAY_MS : null;
      const onCooldown = !!timestamp && expiresAt > Date.now();

      if (onCooldown) {
        setCooldownActive(true);
        setCooldownUntil(expiresAt);
        Alert.alert(
          "Quiz Cooling Down",
          "You've already completed this quiz today. Please come back tomorrow!"
        );
        return;
      }
      if (!timestamp && cooldownActive) {
        setCooldownActive(false);
        setCooldownUntil(null);
      }
    } catch (err) {
      console.error("[QuizCard] Failed to check quiz cooldown:", err);
    }

    router.push({
      pathname: "/QuizScreen",
      params: { quiz: quizParams },
    });
  }, [cooldownActive, isCompleted, quizId, quizParams, router]);

  const cooldownMessage = useMemo(() => {
    if (!cooldownUntil) return null;
    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs <= 0) return null;
    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    return remainingHours > 1
      ? `Come back in ${remainingHours} hours to retry.`
      : "Come back within the hour to retry.";
  }, [cooldownUntil]);

  const iconData = resolveIcon(quiz.title);

  return (
    <View style={styles.card}>
      {/* Header Row */}
      <View style={styles.header}>
        <View style={[styles.iconWrapper, { backgroundColor: iconData.bg }]}>
          <MaterialIcons name={iconData.icon} size={28} color="white" />
        </View>

        <View style={styles.textWrapper}>
          <Text style={styles.title}>{quiz.title}</Text>
          <Text style={styles.subtitle}>{quiz.subtitle}</Text>
          {cooldownActive && cooldownMessage ? (
            <Text style={styles.cooldownText}>{cooldownMessage}</Text>
          ) : null}
        </View>
      </View>

      {/* Footer Button */}
      <TouchableOpacity
        style={[
          styles.button,
          (isCompleted || cooldownActive) && styles.buttonDisabled,
        ]}
        activeOpacity={isCompleted ? 1 : 0.85}
        onPress={handlePress}
      >
        <Text
          style={[
            styles.buttonLabel,
            (isCompleted || cooldownActive) && styles.buttonLabelDisabled,
          ]}
        >
          {buttonLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default QuizCard;
