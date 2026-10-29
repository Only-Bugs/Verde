import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

import { ArticleCard } from "../../components/learning/ArticleCard";
import InteractiveQuiz from "../../components/learning/quiz/InteractiveQuiz";
import RangeSwitch from "../../components/learning/RangeSwitch";
import PageHeader from "../../components/PageHeader";
import { chunk, PAGE_SIZE } from "../../helpers/paging";
import colors from "../../theme/colors";
import layout from "../../theme/layout";
import { logAnalyticsEvent } from "../../utils/analytics";
import { useUser } from "../../context/UserContext";
import { authorizedFetch } from "../../services/apiClient";

const FEATURED_LIMIT = 3;
const SKELETON_COUNT = 3;
const PAGE_FADE_OUT = 150;
const PAGE_FADE_IN = 190;
const API_FALLBACK_ENDPOINT =
  "https://ipg9jzatg7.execute-api.ap-southeast-2.amazonaws.com/dev/articles";
const ARTICLES_SUBTITLE = "Fresh guidance to support your greener habits.";

const ARTICLE_TABS = [
  {
    key: "featured",
    label: "Featured",
    accessibilityLabel: "Show featured articles",
  },
  {
    key: "latest",
    label: "Latest",
    accessibilityLabel: "Show latest articles",
  },
];

let ARTICLE_ENDPOINT = API_FALLBACK_ENDPOINT;
try {
  const apiConfig = require("../../config/apiConfig").default;
  if (apiConfig?.endpoints?.articles) {
    ARTICLE_ENDPOINT = `${apiConfig.baseURL}${apiConfig.endpoints.articles}`;
  }
} catch (error) {
  if (__DEV__) {
    console.warn(
      "[LearningPage] Using fallback articles endpoint.",
      error?.message || error
    );
  }
}

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const mockArticles = [
  {
    article_id: "art-1",
    title: "Cutting Food Waste at Home",
    summary:
      "Simple steps for planning meals, storing ingredients, and using leftovers to reduce waste.",
    reading_time_minutes: 6,
    published_date: "2024-02-12",
    author: "Sustainability Team",
    source_url: "https://www.energy.nsw.gov.au/",
    is_featured: true,
  },
  {
    article_id: "art-2",
    title: "Commute Smarter: Embrace Active Transport",
    summary:
      "See how short trips by bike or on foot can shrink your carbon footprint and boost wellbeing.",
    reading_time_minutes: 5,
    published_date: "2024-01-28",
    author: "Verde Mobility Lab",
    source_url: "https://transport.gov.au/",
    is_featured: false,
  },
  {
    article_id: "art-3",
    title: "Greener Energy Bills Explained",
    summary:
      "Understand renewable tariffs, off-peak usage, and energy monitoring to lower household impact.",
    reading_time_minutes: 8,
    published_date: "2023-12-04",
    author: "Energy Insights",
    source_url: "https://climatecouncil.org.au/",
    is_featured: true,
  },
  {
    article_id: "art-4",
    title: "Smart Home Upgrades for 2024",
    summary:
      "Pick the right upgrades to lower energy costs and carbon footprint.",
    reading_time_minutes: 7,
    published_date: "2023-11-12",
    author: "Future Living",
    source_url: "https://energysmart.com.au/",
    is_featured: false,
  },
  {
    article_id: "art-5",
    title: "Water Wise Gardening Tips",
    summary:
      "Reduce outdoor water waste with efficient irrigation and plant choices.",
    reading_time_minutes: 4,
    published_date: "2023-10-02",
    author: "Green Thumbs",
    source_url: "https://waterwise.gov.au/",
    is_featured: false,
  },
];

const normalizeTitle = (title) =>
  (title || "")
    .toLowerCase()
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const FEATURED_TITLE_PATTERNS = [
  "everyday sustainability",
  "eco-friendly habit you can start",
  "diet help fight climate change",
];
const LATEST_TITLE_PATTERNS = [];
const EXCLUDE_FEATURED_PATTERNS = [
  "grow your own",
  "energy saving tips for households",
];

const matchesPattern = (normalizedTitle, patterns) =>
  Boolean(normalizedTitle) &&
  patterns.some((pattern) => normalizedTitle.includes(pattern));

const SkeletonCard = () => {
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [pulse]);

  return (
    <Animated.View style={[styles.articleCardShell, { opacity: pulse }]}>
      <View style={styles.skeletonRow}>
        <View style={styles.skeletonMedia} />
        <View style={styles.skeletonBody}>
          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          <View
            style={[
              styles.skeletonLine,
              styles.skeletonLineMedium,
              styles.skeletonLineMarginTop,
            ]}
          />
          <View style={styles.skeletonMetaRow}>
            <View style={styles.skeletonDot} />
            <View style={[styles.skeletonLine, styles.skeletonLineTextMeta]} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const EmptyBanner = ({ message }) => (
  <View style={[styles.banner, styles.bannerNeutral]}>
    <View style={styles.bannerRow}>
      <MaterialIcons name="auto-stories" size={20} color={colors.eco.blue} />
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  </View>
);

const ErrorBanner = ({ retrying, onRetry }) => (
  <View style={[styles.banner, styles.bannerError]}>
    <View style={styles.bannerRow}>
      <MaterialIcons name="report-problem" size={20} color={colors.warning} />
      <Text style={styles.bannerText}>Couldn’t load. Tap retry.</Text>
    </View>
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Retry loading articles"
      hitSlop={layout.hitSlop}
      style={[styles.bannerCta, retrying && styles.bannerCtaDisabled]}
      activeOpacity={0.85}
      disabled={retrying}
      onPress={onRetry}
    >
      <MaterialIcons
        name="refresh"
        size={16}
        color={retrying ? colors.textSecondary : colors.neutral.white}
      />
      <Text
        style={[
          styles.bannerCtaLabel,
          retrying && styles.bannerCtaLabelDisabled,
        ]}
      >
        {retrying ? "Retrying…" : "Retry"}
      </Text>
    </TouchableOpacity>
  </View>
);

const LearningPage = () => {
  const [articles, setArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [errorArticles, setErrorArticles] = useState(false);
  const [retryingArticles, setRetryingArticles] = useState(false);
  const [expandedArticleId, setExpandedArticleId] = useState(null);
  const [activeTab, setActiveTab] = useState("featured");
  const [pageByTab, setPageByTab] = useState({ featured: 0, latest: 0 });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const pageAnim = useRef(new Animated.Value(1)).current;
  const { user } = useUser();

  const loadArticles = useCallback(async (isRetry = false) => {
    if (isRetry) {
      setRetryingArticles(true);
    } else {
      setLoadingArticles(true);
    }
    setErrorArticles(false);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await authorizedFetch(
        ARTICLE_ENDPOINT,
        { signal: controller.signal },
        {
          ecoId: user?.eco_id,
          skipAuth: !user?.eco_id,
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const payload = await response.json();
      const list = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];

      if (!list.length) {
        setArticles(mockArticles);
      } else {
        setArticles(list);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn(
          "[LearningPage] Failed to load articles, using fallback data.",
          error?.message || error
        );
      }
      setErrorArticles(true);
      setArticles(mockArticles);
    } finally {
      setLoadingArticles(false);
      setRetryingArticles(false);
      setExpandedArticleId(null);
      setHasLoadedOnce(true);
    }
  }, [user?.eco_id]);

  useEffect(() => {
    loadArticles(false);
  }, [loadArticles]);

  const articleBuckets = useMemo(() => {
    const sortByDateDesc = (a, b) =>
      (b.published_date || "").localeCompare(a.published_date || "");
    const list = (articles || []).map((item) => {
      const normalizedTitle = normalizeTitle(item?.title);

      if (matchesPattern(normalizedTitle, FEATURED_TITLE_PATTERNS)) {
        return { ...item, is_featured: true };
      }

      if (
        matchesPattern(normalizedTitle, LATEST_TITLE_PATTERNS) ||
        matchesPattern(normalizedTitle, EXCLUDE_FEATURED_PATTERNS)
      ) {
        return { ...item, is_featured: false };
      }

      return item;
    });
    const featured = list
      .filter((item) => item?.is_featured)
      .sort((a, b) => {
        const aTitle = normalizeTitle(a?.title);
        const bTitle = normalizeTitle(b?.title);
        const aForced = matchesPattern(aTitle, FEATURED_TITLE_PATTERNS);
        const bForced = matchesPattern(bTitle, FEATURED_TITLE_PATTERNS);

        if (aForced && !bForced) {
          return -1;
        }

        if (!aForced && bForced) {
          return 1;
        }

        return sortByDateDesc(a, b);
      })
      .slice(0, FEATURED_LIMIT);
    const latest = list
      .filter((item) => !item?.is_featured)
      .sort((a, b) => {
        const aTitle = normalizeTitle(a?.title);
        const bTitle = normalizeTitle(b?.title);
        const aForced = matchesPattern(aTitle, LATEST_TITLE_PATTERNS);
        const bForced = matchesPattern(bTitle, LATEST_TITLE_PATTERNS);

        if (aForced && !bForced) {
          return -1;
        }

        if (!aForced && bForced) {
          return 1;
        }

        return sortByDateDesc(a, b);
      });

    return {
      featuredArticles: featured,
      latestArticles: latest,
      featuredChunks: chunk(featured, PAGE_SIZE),
      latestChunks: chunk(latest, PAGE_SIZE),
    };
  }, [articles]);

  const { featuredArticles, latestArticles, featuredChunks, latestChunks } =
    articleBuckets;

  useEffect(() => {
    setPageByTab((prev) => ({
      featured: featuredChunks.length
        ? Math.min(prev.featured, featuredChunks.length - 1)
        : 0,
      latest: latestChunks.length
        ? Math.min(prev.latest, latestChunks.length - 1)
        : 0,
    }));
  }, [featuredChunks.length, latestChunks.length]);

  useEffect(() => {
    if (featuredArticles.length === 0 && latestArticles.length > 0) {
      setActiveTab("latest");
    } else if (
      latestArticles.length === 0 &&
      featuredArticles.length > 0 &&
      activeTab === "latest"
    ) {
      setActiveTab("featured");
    }
  }, [activeTab, featuredArticles.length, latestArticles.length]);

  useEffect(() => {
    Animated.timing(pageAnim, {
      toValue: 0.95,
      duration: 120,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      Animated.timing(pageAnim, {
        toValue: 1,
        duration: PAGE_FADE_IN,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  }, [activeTab, pageAnim]);

  const handleTabChange = useCallback((tabKey) => {
    setActiveTab((prev) => {
      if (prev === tabKey) {
        return prev;
      }
      setExpandedArticleId(null);
      logAnalyticsEvent("learning_tab_switch", { tab: tabKey });
      return tabKey;
    });
  }, []);

  const animatePageChange = useCallback(
    (tabKey, currentIndex, targetIndex) => {
      const chunks = tabKey === "featured" ? featuredChunks : latestChunks;
      const total = chunks.length;
      if (!total) {
        return;
      }
      const clamped = Math.max(0, Math.min(targetIndex, total - 1));
      if (clamped === currentIndex) {
        return;
      }

      Animated.timing(pageAnim, {
        toValue: 0.85,
        duration: PAGE_FADE_OUT,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setExpandedArticleId(null);
        setPageByTab((prev) => ({ ...prev, [tabKey]: clamped }));
        Animated.timing(pageAnim, {
          toValue: 1,
          duration: PAGE_FADE_IN,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      });

      logAnalyticsEvent("articles_page_change", { tab: tabKey, page: clamped });
    },
    [featuredChunks, latestChunks, pageAnim]
  );

  const handleNextPage = useCallback(() => {
    const tabKey = activeTab;
    const chunks = tabKey === "featured" ? featuredChunks : latestChunks;
    if (!chunks.length) {
      return;
    }
    const current = pageByTab[tabKey] ?? 0;
    animatePageChange(tabKey, current, current + 1);
  }, [activeTab, animatePageChange, featuredChunks, latestChunks, pageByTab]);

  const handlePrevPage = useCallback(() => {
    const tabKey = activeTab;
    const chunks = tabKey === "featured" ? featuredChunks : latestChunks;
    if (!chunks.length) {
      return;
    }
    const current = pageByTab[tabKey] ?? 0;
    animatePageChange(tabKey, current, current - 1);
  }, [activeTab, animatePageChange, featuredChunks, latestChunks, pageByTab]);

  const handleArticleToggle = useCallback((articleId) => {
    setExpandedArticleId((prev) => {
      const nextId = prev === articleId ? null : articleId;
      if (nextId) {
        logAnalyticsEvent("article_expand", { article_id: articleId });
      }
      return nextId;
    });
  }, []);

  const currentChunks =
    activeTab === "featured" ? featuredChunks : latestChunks;
  const currentPage = pageByTab[activeTab] ?? 0;
  const visibleArticles = currentChunks[currentPage] ?? [];
  const totalPages = currentChunks.length;
  const canGoPrev = currentPage > 0;
  const canGoNext = totalPages > 0 && currentPage < totalPages - 1;
  const emptyMessage = "No articles yet.";
  const shouldShowErrorBanner = errorArticles && !retryingArticles;
  const showSkeleton = loadingArticles && !hasLoadedOnce;

  return (
    <FlatList
      data={[
        <View key="learning-content" style={styles.content}>
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Articles</Text>
              <RangeSwitch
                options={ARTICLE_TABS}
                value={activeTab}
                onChange={handleTabChange}
              />
            </View>
            <Text style={styles.sectionSubtitle}>{ARTICLES_SUBTITLE}</Text>
            <View style={styles.sectionDividerInset} />

            {shouldShowErrorBanner ? (
              <View style={styles.sectionItemSpacing}>
                <ErrorBanner
                  retrying={retryingArticles}
                  onRetry={() => loadArticles(true)}
                />
              </View>
            ) : null}

            {showSkeleton ? (
              Array.from({ length: SKELETON_COUNT }).map((_, idx) => (
                <View
                  key={`articles-skeleton-${idx}`}
                  style={[
                    styles.sectionItemSpacing,
                    idx === 0 && styles.sectionItemSpacingFirst,
                  ]}
                >
                  <SkeletonCard />
                </View>
              ))
            ) : currentChunks.length === 0 ? (
              <View style={styles.sectionItemSpacing}>
                <EmptyBanner message={emptyMessage} />
              </View>
            ) : (
              <>
                <Animated.View
                  style={[
                    styles.latestAnimatedContainer,
                    {
                      opacity: pageAnim,
                      transform: [
                        {
                          scale: pageAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.95, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {visibleArticles.map((article, index) => (
                    <View
                      key={article.article_id}
                      style={[
                        styles.sectionItemSpacing,
                        index === 0 && styles.sectionItemSpacingFirst,
                      ]}
                    >
                      <ArticleCard
                        item={article}
                        expanded={expandedArticleId === article.article_id}
                        onToggle={() => handleArticleToggle(article.article_id)}
                        badgeLabel={
                          activeTab === "latest" && article.is_featured
                            ? "Featured"
                            : undefined
                        }
                        accentOpacity={activeTab === "featured" ? 0.12 : 0.08}
                      />
                    </View>
                  ))}
                </Animated.View>

                {totalPages > 1 ? (
                  <View style={[styles.pagerControls, styles.pagerFooter]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Previous page"
                      accessibilityState={{ disabled: !canGoPrev }}
                      onPress={handlePrevPage}
                      disabled={!canGoPrev}
                      hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                      style={({ pressed }) => [
                        styles.pagerButton,
                        !canGoPrev && styles.pagerButtonDisabled,
                        pressed && canGoPrev && styles.pagerButtonPressed,
                      ]}
                    >
                      {({ pressed }) => (
                        <MaterialIcons
                          name="chevron-left"
                          size={24}
                          color={
                            canGoPrev
                              ? pressed
                                ? colors.eco.green[600]
                                : colors.textPrimary
                              : colors.textSecondary
                          }
                        />
                      )}
                    </Pressable>
                    <View style={styles.pagerDots}>
                      {currentChunks.map((_, index) => (
                        <View
                          key={`dot-${index}`}
                          style={[
                            styles.pagerDot,
                            index === currentPage
                              ? styles.pagerDotActive
                              : styles.pagerDotInactive,
                          ]}
                        />
                      ))}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Next page"
                      accessibilityState={{ disabled: !canGoNext }}
                      onPress={handleNextPage}
                      disabled={!canGoNext}
                      hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                      style={({ pressed }) => [
                        styles.pagerButton,
                        !canGoNext && styles.pagerButtonDisabled,
                        pressed && canGoNext && styles.pagerButtonPressed,
                      ]}
                    >
                      {({ pressed }) => (
                        <MaterialIcons
                          name="chevron-right"
                          size={24}
                          color={
                            canGoNext
                              ? pressed
                                ? colors.eco.green[600]
                                : colors.textPrimary
                              : colors.textSecondary
                          }
                        />
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
          </View>

          <InteractiveQuiz />
        </View>,
      ]}
      keyExtractor={(_, index) => `learning-section-${index}`}
      renderItem={({ item }) => item}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <PageHeader title="Learning Hub" />
          <Text style={styles.pageSubtitle}>
            Discover tips, guides, and quizzes to inspire your next eco move.
          </Text>
        </View>
      }
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  listHeader: {
    marginBottom: layout.sectionSpacing,
  },
  container: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.screenPadding,
    paddingBottom: layout.blockSpacing,
    backgroundColor: colors.background,
  },
  content: {
    gap: layout.blockSpacing - layout.cardSpacing,
  },
  section: {
    gap: layout.cardSpacing,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: layout.cardSpacing,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    maxWidth: 320,
    lineHeight: 20,
  },
  pageSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: colors.textSecondary,
  },
  sectionDividerInset: {
    height: 1,
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    marginTop: 8,
    borderRadius: 1,
  },
  sectionItemSpacing: {
    marginTop: layout.cardSpacing + layout.itemSpacing,
  },
  sectionItemSpacingFirst: {
    marginTop: layout.itemSpacing * 0.5,
  },
  articleCardShell: {
    backgroundColor: colors.neutral.white,
    borderRadius: 16,
    padding: layout.cardSpacing,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skeletonMedia: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.neutral.gray200,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  skeletonBody: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 6,
    backgroundColor: colors.neutral.gray200,
  },
  skeletonLineShort: {
    width: "70%",
  },
  skeletonLineMedium: {
    width: "85%",
  },
  skeletonLineMarginTop: {
    marginTop: 8,
  },
  skeletonLineTextMeta: {
    width: "40%",
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neutral.gray200,
  },
  skeletonMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skeletonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutral.gray300,
  },
  banner: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  bannerNeutral: {
    backgroundColor: colors.neutral.gray100,
  },
  bannerError: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.32)",
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bannerText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  bannerCta: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.eco.green[600],
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bannerCtaDisabled: {
    backgroundColor: colors.neutral.gray300,
  },
  bannerCtaLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.neutral.white,
  },
  bannerCtaLabelDisabled: {
    color: colors.textSecondary,
  },
  pagerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pagerFooter: {
    marginTop: 16,
    justifyContent: "center",
  },
  pagerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.neutral.gray100,
  },
  pagerButtonDisabled: {
    opacity: 0.5,
  },
  pagerButtonPressed: {
    backgroundColor: "rgba(15, 118, 110, 0.12)",
  },
  pagerDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pagerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pagerDotActive: {
    backgroundColor: colors.eco.green[600],
  },
  pagerDotInactive: {
    backgroundColor: colors.neutral.gray300,
  },
  latestAnimatedContainer: {
    marginTop: layout.cardSpacing,
  },
});

export default LearningPage;
