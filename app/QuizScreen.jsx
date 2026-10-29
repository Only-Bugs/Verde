import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "../context/UserContext";
import { awardQuizPoints, flushQuizAwardQueue } from "../services/apis/quizAPI";
import StorageService from "../services/storage";
import colors from "../theme/colors";

const DAY_MS = 24 * 60 * 60 * 1000;

const resolveQuizId = (quiz) =>
  quiz?.quiz_id ||
  quiz?.quizId ||
  quiz?.topic_id ||
  quiz?.topicId ||
  quiz?.title ||
  quiz?.topic_name ||
  null;

const QuizScreen = () => {
  const { quiz } = useLocalSearchParams();
  const parsedQuiz = JSON.parse(quiz);
  const router = useRouter();
  const resolvedQuizId = useMemo(() => resolveQuizId(parsedQuiz), [quiz]);
  const quizParams = useMemo(() => JSON.stringify(parsedQuiz), [quiz]);
  const { user, setCarbonPoints, addCarbonPoints } = useUser();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);
  const [cooldownBlocked, setCooldownBlocked] = useState(false);

  const totalQuestions = parsedQuiz.questions.length;
  const question = parsedQuiz.questions[currentIndex];
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const progressAnim = useRef(new Animated.Value(0)).current;
  const attemptTimestampRef = useRef(new Date().toISOString());
  const idempotencyKeyRef = useRef(null);
  const cooldownAlertShownRef = useRef(false);

  useEffect(() => {
    const ratio = totalQuestions === 0 ? 0 : (currentIndex + 1) / totalQuestions;
    Animated.timing(progressAnim, {
      toValue: ratio,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [currentIndex, totalQuestions, progressAnim]);

  useEffect(() => {
    if (!user?.eco_id) return;

    const processQueue = async () => {
      try {
        // Use clearOnError to skip corrupted queue items and continue processing
        const results = await flushQuizAwardQueue({ clearOnError: true });
        if (!results.length) return;

        let latestBalance = null;
        let totalAwarded = 0;
        results.forEach((item) => {
          if (typeof item.newBalance === "number") {
            latestBalance = item.newBalance;
          }
          if (typeof item.awardedPoints === "number") {
            totalAwarded += item.awardedPoints;
          }
        });

        if (latestBalance !== null) {
          await setCarbonPoints(latestBalance);
        } else if (totalAwarded > 0) {
          await addCarbonPoints(totalAwarded);
        }
      } catch (err) {
        console.error("[QuizScreen] Unable to flush quiz award queue:", err);
      }
    };

    processQueue();
  }, [addCarbonPoints, setCarbonPoints, user?.eco_id]);

  useEffect(() => {
    if (!resolvedQuizId) return;
    let isMounted = true;

    const verifyCooldown = async () => {
      try {
        const timestamp = await StorageService.getQuizCompletionTimestamp(
          resolvedQuizId
        );
        if (!isMounted) return;

        if (timestamp) {
          const expiresAt = timestamp + DAY_MS;
          if (expiresAt > Date.now()) {
            setCooldownBlocked(true);
            if (!cooldownAlertShownRef.current) {
              cooldownAlertShownRef.current = true;
              Alert.alert(
                "Quiz Cooling Down",
                "You've already completed this quiz today. Please come back tomorrow!",
                [
                  {
                    text: "OK",
                    onPress: () => router.replace("/LearningPage"),
                  },
                ],
                { cancelable: false }
              );
            }
            return;
          }
          await StorageService.clearQuizCompletionTimestamp(resolvedQuizId);
        }

        if (!isMounted) return;
        setCooldownBlocked(false);
        cooldownAlertShownRef.current = false;
      } catch (err) {
        console.error("[QuizScreen] Failed to verify quiz cooldown:", err);
      }
    };

    verifyCooldown();

    return () => {
      isMounted = false;
    };
  }, [resolvedQuizId, router]);

  const handleSelectOption = (option) => {
    if (hasSubmitted || cooldownBlocked) return;
    setSelectedOption(option);
  };

  const submitCurrentAnswer = () => {
    if (!selectedOption || hasSubmitted || cooldownBlocked) return;
    setHasSubmitted(true);
    setShowExplanation(true);
    setAnswers((prev) => [
      ...prev,
      {
        quesId: question.quiz_ques_id,
        isCorrect: selectedOption.quiz_option_is_correct === 1,
      },
    ]);
  };

  const goToResults = async () => {
    if (isSubmittingResult) return;

    const correctCount = answers.filter((a) => a.isCorrect).length;
    const total = parsedQuiz.questions.length;
    const percentage =
      total === 0 ? 0 : Math.round((correctCount / total) * 100);
    const baseAward = Math.max(0, Math.min(correctCount, total));

    let awardedPoints = baseAward;
    let newBalance = null;
    let awardPending = false;

    setIsSubmittingResult(true);
    try {
      const ecoId = user?.eco_id;
      if (ecoId && resolvedQuizId) {
        if (!idempotencyKeyRef.current) {
          idempotencyKeyRef.current = `${resolvedQuizId}:${ecoId}:${attemptTimestampRef.current}`;
        }

        const result = await awardQuizPoints({
          ecoId,
          quizId: resolvedQuizId,
          correct: correctCount,
          total,
          idempotencyKey: idempotencyKeyRef.current,
        });

        awardedPoints =
          typeof result.awardedPoints === "number"
            ? result.awardedPoints
            : baseAward;

        if (typeof result.newBalance === "number") {
          newBalance = result.newBalance;
          await setCarbonPoints(result.newBalance);
        } else if (
          typeof result.awardedPoints === "number" &&
          result.awardedPoints > 0
        ) {
          await addCarbonPoints(result.awardedPoints);
        }
      }
    } catch (err) {
      console.error("[QuizScreen] Failed to award quiz points:", err);
      awardedPoints =
        typeof err?.awardedPoints === "number" ? err.awardedPoints : baseAward;
      awardPending = err?.wasQueued === true;
    } finally {
      setIsSubmittingResult(false);
      if (resolvedQuizId) {
        StorageService.setQuizCompletionTimestamp(resolvedQuizId).catch((err) =>
          console.error(
            "[QuizScreen] Failed to store quiz completion timestamp:",
            err
          )
        );
      }
      router.push({
        pathname: "/quizResult",
        params: {
          score: correctCount.toString(),
          total: total.toString(),
          percentage: percentage.toString(),
          title: parsedQuiz.topic_name,
          quizData: quizParams,
          awardedPoints: awardedPoints.toString(),
          newBalance:
            newBalance !== null && newBalance !== undefined
              ? String(newBalance)
              : "",
          awardPending: awardPending ? "1" : "0",
        },
      });
    }
  };

  const handleNext = async () => {
    if (isSubmittingResult || cooldownBlocked) return;

    if (!hasSubmitted) {
      submitCurrentAnswer();
      return;
    }

    if (currentIndex < parsedQuiz.questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setShowExplanation(false);
      setHasSubmitted(false);
    } else {
      await goToResults();
    }
  };

  const handleBackPress = () => setConfirmVisible(true);
  const handleCancelExit = () => setConfirmVisible(false);
  const handleConfirmExit = () => {
    setConfirmVisible(false);
    router.replace("/LearningPage");
  };

  const renderOption = ({ item }) => {
    const isSelected = selectedOption?.quiz_option_id === item.quiz_option_id;
    const isCorrect = item.quiz_option_is_correct === 1;
    const hasAnswered = hasSubmitted;

    const optionStyle = [styles.optionCard];
    const optionTextStyle = [styles.optionText];

    if (hasAnswered) {
      if (isCorrect) {
        optionStyle.push(styles.optionCardCorrect);
        optionTextStyle.push(styles.optionTextCorrect);
      } else if (isSelected) {
        optionStyle.push(styles.optionCardWrong);
        optionTextStyle.push(styles.optionTextWrong);
      } else {
        optionStyle.push(styles.optionCardMuted);
        optionTextStyle.push(styles.optionTextMuted);
      }
    } else if (isSelected) {
      optionStyle.push(styles.optionCardSelected);
      optionTextStyle.push(styles.optionTextSelected);
    }

    return (
      <TouchableOpacity
        style={optionStyle}
        onPress={() => handleSelectOption(item)}
        activeOpacity={0.92}
        disabled={hasAnswered || cooldownBlocked}
        accessibilityState={{ disabled: hasAnswered || cooldownBlocked }}
      >
        <Text style={optionTextStyle}>{item.quiz_option_text}</Text>
      </TouchableOpacity>
    );
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const canProceed =
    (hasSubmitted || !!selectedOption) && !isSubmittingResult && !cooldownBlocked;
  const buttonLabel = cooldownBlocked
    ? "Come Back Tomorrow"
    : isSubmittingResult
    ? "Finishing..."
    : hasSubmitted
    ? isLastQuestion
      ? "View Results"
      : "Next Question"
    : "Submit Answer";

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBackPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="arrow-back" size={26} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{parsedQuiz.topic_name}</Text>
        </View>
        <Text style={styles.headerHint}>Earn 1 point per correct answer.</Text>

        <View style={styles.progressContainer} accessibilityRole="progressbar">
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressLabel}>
              Question {Math.min(currentIndex + 1, totalQuestions)} of {totalQuestions}
            </Text>
            <Text style={styles.progressLabel}>
              {totalQuestions
                ? Math.round(((currentIndex + 1) / totalQuestions) * 100)
                : 0}
              % complete
            </Text>
          </View>
        </View>

        <View style={styles.questionCard}>
          <View style={styles.iconWrapper}>
            <MaterialIcons name="eco" size={28} color={colors.eco.green[600]} />
          </View>
          <Text style={styles.questionText}>{question.quiz_ques_text}</Text>
        </View>

        <FlatList
          data={question.options}
          keyExtractor={(item) => item.quiz_option_id.toString()}
          renderItem={renderOption}
          contentContainerStyle={styles.optionsList}
          showsVerticalScrollIndicator={false}
          extraData={{ selectedOption, hasSubmitted }}
        />

        {showExplanation && hasSubmitted && selectedOption && (
          <View
            style={[
              styles.explanationContainer,
              selectedOption.quiz_option_is_correct === 1
                ? styles.explanationCorrect
                : styles.explanationWrong,
            ]}
            accessibilityRole="text"
          >
            <View style={styles.explanationHeader}>
              <MaterialIcons
                name={
                  selectedOption.quiz_option_is_correct === 1
                    ? "check-circle"
                    : "cancel"
                }
                size={22}
                color={
                  selectedOption.quiz_option_is_correct === 1
                    ? colors.eco.green[600]
                    : "#E53935"
                }
              />
              <Text
                style={
                  selectedOption.quiz_option_is_correct === 1
                    ? styles.explanationTitleCorrect
                    : styles.explanationTitleWrong
                }
              >
                {selectedOption.quiz_option_is_correct === 1
                  ? "Correct!"
                  : "Incorrect Answer"}
              </Text>
            </View>

            <Text style={styles.explanationText}>
              {selectedOption.quiz_option_explanation}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.nextButton,
            !canProceed && styles.nextButtonDisabled,
          ]}
          onPress={handleNext}
          activeOpacity={canProceed ? 0.92 : 1}
          disabled={!canProceed}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canProceed }}
          accessibilityLabel={buttonLabel}
        >
          <Text style={styles.nextButtonLabel}>{buttonLabel}</Text>
        </TouchableOpacity>

      </View>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelExit}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Leave Quiz?</Text>
            <Text style={styles.modalMessage}>
              Your current progress will be lost. Are you sure you want to return to the Learning Page?
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                onPress={handleCancelExit}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonSecondary,
                  pressed && styles.modalButtonSecondaryPressed,
                ]}
              >
                <Text style={styles.modalButtonSecondaryLabel}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmExit}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  pressed && styles.modalButtonPrimaryPressed,
                ]}
              >
                <Text style={styles.modalButtonPrimaryLabel}>Leave Quiz</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginLeft: 12,
    flex: 1,
  },
  headerHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressTrack: {
    height: 8,
    borderRadius: 12,
    backgroundColor: "#C8E6C9",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2E7D32",
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: "#455A64",
    fontWeight: "500",
  },
  questionCard: {
    backgroundColor: colors.neutral.white,
    padding: 24,
    borderRadius: 20,
    marginBottom: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconWrapper: {
    backgroundColor: "rgba(34,197,94,0.12)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    textAlign: "center",
    lineHeight: 26,
  },
  optionsList: {
    paddingBottom: 8,
  },
  optionCard: {
    backgroundColor: colors.neutral.white,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.neutral.gray200,
    shadowColor: "rgba(15, 23, 42, 0.06)",
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  optionCardSelected: {
    borderColor: "#2E7D32",
    backgroundColor: "#E8F5E9",
  },
  optionCardCorrect: {
    borderColor: "#2E7D32",
    backgroundColor: "#E8F5E9",
  },
  optionCardWrong: {
    borderColor: "#E53935",
    backgroundColor: "#FDECEA",
  },
  optionCardMuted: {
    opacity: 0.7,
  },
  optionText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  optionTextSelected: {
    color: "#2E7D32",
  },
  optionTextCorrect: {
    color: "#2E7D32",
  },
  optionTextWrong: {
    color: "#E53935",
  },
  optionTextMuted: {
    color: colors.textSecondary,
  },
  explanationContainer: {
    marginTop: 24,
    marginBottom: 20,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "rgba(15,23,42,0.2)",
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  explanationCorrect: {
    backgroundColor: "#E8F5E9",
    borderColor: "#A5D6A7",
  },
  explanationWrong: {
    backgroundColor: "#FDECEA",
    borderColor: "#FFCDD2",
  },
  explanationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  explanationTitleCorrect: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2E7D32",
    marginLeft: 8,
  },
  explanationTitleWrong: {
    fontSize: 16,
    fontWeight: "700",
    color: "#B71C1C",
    marginLeft: 8,
  },
  explanationText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  nextButton: {
    marginTop: 8,
    backgroundColor: "#2E7D32",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "rgba(46,125,50,0.35)",
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.neutral.white,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.neutral.white,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: "center",
  },
  modalButtonSecondary: {
    backgroundColor: colors.neutral.white,
    borderWidth: 1,
    borderColor: colors.neutral.gray200,
  },
  modalButtonSecondaryPressed: {
    backgroundColor: colors.neutral.gray100,
  },
  modalButtonPrimary: {
    backgroundColor: colors.eco.green[600],
  },
  modalButtonPrimaryPressed: {
    backgroundColor: colors.eco.green[700] || colors.eco.green[600],
  },
  modalButtonSecondaryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  modalButtonPrimaryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.neutral.white,
  },
});

export default QuizScreen;
