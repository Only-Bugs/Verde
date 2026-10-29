import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { MaterialIcons } from '@expo/vector-icons';

import colors from '../../theme/colors';

const HEADER_HEIGHT = 56;
const HIT_SLOP = { top: 10, right: 10, bottom: 10, left: 10 };

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_err) {
    return '';
  }
}

// Mounted only while the modal is visible, so loading/error/history state resets on every open.
function Reader({ item, onClose }) {
  const insets = useSafeAreaInsets();
  const webRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const domain = useMemo(() => getDomain(item.source_url), [item.source_url]);

  // Back moves through the reader's own history first, then closes the modal.
  const handleBack = useCallback(() => {
    if (canGoBack && webRef.current) {
      webRef.current.goBack();
      return true;
    }
    onClose();
    return true;
  }, [canGoBack, onClose]);

  const handleRetry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  const handleOpenExternally = useCallback(() => {
    Linking.openURL(item.source_url).catch(() => {});
  }, [item.source_url]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canGoBack ? 'Go back' : 'Close article'}
          onPress={handleBack}
          hitSlop={HIT_SLOP}
          style={styles.iconButton}
        >
          <MaterialIcons name={canGoBack ? 'arrow-back' : 'close'} size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {domain ? (
            <Text style={styles.headerDomain} numberOfLines={1}>
              {domain}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open in browser"
          onPress={handleOpenExternally}
          hitSlop={HIT_SLOP}
          style={styles.iconButton}
        >
          <MaterialIcons name="open-in-new" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {failed ? (
          <View style={styles.errorState}>
            <MaterialIcons name="cloud-off" size={40} color={colors.textSecondary} />
            <Text style={styles.errorTitle}>Couldn't load this article</Text>
            <Text style={styles.errorMessage}>Check your connection and try again.</Text>
            <View style={styles.errorActions}>
              <Pressable accessibilityRole="button" onPress={handleRetry} style={[styles.button, styles.buttonPrimary]}>
                <Text style={styles.buttonPrimaryLabel}>Retry</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={handleOpenExternally} style={[styles.button, styles.buttonSecondary]}>
                <Text style={styles.buttonSecondaryLabel}>Open in browser</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <WebView
            key={reloadKey}
            ref={webRef}
            source={{ uri: item.source_url }}
            style={styles.webview}
            setSupportMultipleWindows={false}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            onHttpError={(event) => {
              if (event.nativeEvent.statusCode >= 400) {
                setFailed(true);
              }
            }}
            onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
          />
        )}
        {loading && !failed ? (
          <View pointerEvents="none" style={styles.loading}>
            <ActivityIndicator size="large" color={colors.eco.green[600]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const ArticleReaderModalComponent = ({ visible, item, onClose }) => {
  if (!item?.source_url) {
    return null;
  }
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Modals on Android render in their own window, so they need their own SafeAreaProvider. */}
      <SafeAreaProvider>{visible ? <Reader item={item} onClose={onClose} /> : null}</SafeAreaProvider>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral.gray200,
    backgroundColor: colors.neutral.white,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerDomain: {
    marginTop: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  errorTitle: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  errorMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonPrimary: {
    backgroundColor: colors.eco.green[600],
  },
  buttonPrimaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.neutral.white,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: colors.neutral.gray200,
    backgroundColor: colors.neutral.white,
  },
  buttonSecondaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

export const ArticleReaderModal = memo(ArticleReaderModalComponent);
export default ArticleReaderModal;
