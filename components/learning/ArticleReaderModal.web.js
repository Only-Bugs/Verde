import { memo, useCallback, useMemo } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';

import colors from '../../theme/colors';

// react-native-webview has no web implementation, and most publishers block iframes
// (X-Frame-Options / frame-ancestors). On web the reader shows the article's summary
// inside the app and offers the full article in a new tab.
const ArticleReaderModalComponent = ({ visible, item, onClose }) => {
  const domain = useMemo(() => {
    try {
      return new URL(item?.source_url).hostname.replace(/^www\./, '');
    } catch (_err) {
      return '';
    }
  }, [item?.source_url]);

  const handleOpenFull = useCallback(() => {
    if (item?.source_url) {
      Linking.openURL(item.source_url).catch(() => {});
    }
  }, [item?.source_url]);

  if (!item) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerLabel} numberOfLines={1}>
              {domain || 'Article'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close article" onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.hero} resizeMode="cover" /> : null}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {[item.author, item.published_date ? dayjs(item.published_date).format('MMM D, YYYY') : null, item.reading_time_minutes ? `${item.reading_time_minutes} min read` : null]
                .filter(Boolean)
                .join(' • ')}
            </Text>
            <Text style={styles.summary}>{item.summary}</Text>
            <Pressable accessibilityRole="link" onPress={handleOpenFull} style={styles.cta}>
              <Text style={styles.ctaLabel}>Read the full article</Text>
              <MaterialIcons name="open-in-new" size={18} color={colors.neutral.white} />
            </Pressable>
            <Text style={styles.note}>The full article opens in a new tab on {domain || 'the publisher’s site'}.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    backgroundColor: colors.neutral.white,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral.gray200,
  },
  headerLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    gap: 12,
  },
  hero: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: colors.neutral.gray100,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  summary: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  cta: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.eco.green[600],
  },
  ctaLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.neutral.white,
  },
  note: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});

export const ArticleReaderModal = memo(ArticleReaderModalComponent);
export default ArticleReaderModal;
