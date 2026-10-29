import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  Image,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import dayjs from 'dayjs';

import colors from '../../theme/colors';
import layout from '../../theme/layout';
import { ArticleReaderModal } from './ArticleReaderModal';

const CHEVRON_HIT_SLOP = { top: 12, right: 12, bottom: 12, left: 12 };
const ANIMATION_DURATION = 180;
const PLACEHOLDER_ICONS = ['eco', 'public', 'article', 'menu-book', 'park'];

function hashString(value = '') {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

const ArticleCardComponent = ({ item, expanded, onToggle, badgeLabel, showThumb = true, accentOpacity = 0.1 }) => {
  const detailProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const chevronProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const isExpanded = expanded === true;
  const [imageError, setImageError] = useState(false);
  const [readerVisible, setReaderVisible] = useState(false);
  const imageUri = item.image_url && !imageError ? item.image_url : null;

  useEffect(() => {
    setImageError(false);
  }, [item.image_url]);

  useEffect(() => {
    const config = {
      toValue: expanded ? 1 : 0,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    };

    Animated.timing(detailProgress, config).start();
    Animated.timing(chevronProgress, config).start();
  }, [chevronProgress, detailProgress, expanded]);

  const formattedDate = useMemo(() => dayjs(item.published_date).format('MMM D, YYYY'), [item.published_date]);
  const domain = useMemo(() => {
    try {
      return new URL(item.source_url).hostname.replace(/^www\./, '');
    } catch (_err) {
      return '';
    }
  }, [item.source_url]);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  // Articles open in an in-app reader so the user never leaves Verde.
  const handleOpenReader = useCallback(() => {
    if (item.source_url) {
      setReaderVisible(true);
    }
  }, [item.source_url]);

  const handleCloseReader = useCallback(() => {
    setReaderVisible(false);
  }, []);

  const accentColor = `rgba(15, 118, 110, ${accentOpacity})`;

  const placeholderIcon = useMemo(() => {
    const index = Math.abs(hashString(item.article_id || item.title)) % PLACEHOLDER_ICONS.length;
    return PLACEHOLDER_ICONS[index];
  }, [item.article_id, item.title]);

  return (
    <View style={styles.container}>
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      <View style={styles.cardRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show details for ${item.title}`}
          onPress={handleToggle}
          android_ripple={{ color: 'rgba(15, 118, 110, 0.12)', borderless: false }}
          hitSlop={layout.hitSlop}
          style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
        >
          {showThumb ? (
            <View style={styles.thumbnailWrapper}>
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <LinearGradient
                  colors={[colors.eco.green[200], colors.eco.green[50]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.thumbnailFallback}
                >
                  <MaterialIcons name={placeholderIcon} size={24} color="rgba(15, 118, 110, 0.65)" />
                </LinearGradient>
              )}
            </View>
          ) : null}
          <View style={styles.content}>
            {badgeLabel ? (
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>{badgeLabel}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={(event) => {
                event?.stopPropagation?.();
                handleToggle();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} article ${item.title}`}
              hitSlop={layout.hitSlop}
            >
              <Text style={styles.title} numberOfLines={isExpanded ? undefined : 2}>
                {item.title}
              </Text>
            </Pressable>
            {!isExpanded ? (
              <Text style={styles.meta}>
                {`• ${item.reading_time_minutes} min • ${formattedDate}`}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? `Collapse details for ${item.title}` : `Expand details for ${item.title}`}
          onPress={handleToggle}
          hitSlop={CHEVRON_HIT_SLOP}
          style={({ pressed }) => [
            styles.chevronButton,
            pressed && styles.chevronPressed,
          ]}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: chevronProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                },
              ],
            }}
          >
            <MaterialIcons name="expand-more" size={28} color={colors.textPrimary} />
          </Animated.View>
        </Pressable>
      </View>

      {expanded ? (
        <Animated.View
          pointerEvents="auto"
          style={[
            styles.detail,
            {
              opacity: detailProgress,
              transform: [
                {
                  scale: detailProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.97, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.detailImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              onError={() => setImageError(true)}
            />
          ) : null}
          <Text style={styles.detailBrief}>{item.summary}</Text>
          <Text style={styles.detailMeta}>
            {(item.author || 'Unknown author') + ' • ' + formattedDate + ` • ${item.reading_time_minutes} min`}
          </Text>
          <Text style={styles.detailTip}>Read the full article without leaving Verde.</Text>
          {item.source_url ? (
            <Pressable
              onPress={handleOpenReader}
              accessibilityRole="button"
              accessibilityLabel={`Read article: ${item.title}`}
              accessibilityHint="Opens the article in a reader inside the app"
              hitSlop={CHEVRON_HIT_SLOP}
              style={styles.detailDomainChip}
            >
              <MaterialIcons name="menu-book" size={16} color="#0B3B2E" />
              <Text style={styles.detailDomainText}>{domain ? `Read on ${domain}` : 'Read article'}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
      <ArticleReaderModal visible={readerVisible} item={item} onClose={handleCloseReader} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.neutral.white,
    borderRadius: 16,
    padding: layout.cardSpacing,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardPressed: {
    opacity: 0.92,
  },
  thumbnailWrapper: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.neutral.gray100,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    marginBottom: 6,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.eco.blue,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(71, 85, 105, 0.75)',
  },
  chevronButton: {
    padding: 4,
    marginLeft: layout.cardSpacing / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevronPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  detail: {
    marginTop: layout.itemSpacing,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
    paddingTop: layout.itemSpacing,
    paddingBottom: layout.itemSpacing,
    gap: 8,
  },
  detailImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.neutral.gray100,
  },
  detailBrief: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  detailMeta: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textSecondary,
  },
  detailTip: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
  },
  detailDomainChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F7EF',
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  detailDomainText: {
    fontSize: 13,
    color: '#0B3B2E',
    fontWeight: '500',
  },
});

export const ArticleCard = memo(ArticleCardComponent);
