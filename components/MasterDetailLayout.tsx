import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native';
import { theme } from '../constants/theme';

interface Props {
  /** 0~1: master panel flex ratio (e.g. 0.35) */
  leftFlex: number;
  masterContent: React.ReactNode;
  detailContent: React.ReactNode;
  /** Optional full-width header above both panels */
  headerContent?: React.ReactNode;
  /** Optional FAB pinned to bottom-right of master panel */
  fab?: React.ReactNode;
  /** Whether anything is selected in the detail panel */
  hasSelection?: boolean;
  /** Icon + message shown when nothing is selected */
  emptyIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  emptyMessage?: string;
}

export default function MasterDetailLayout({
  leftFlex,
  masterContent,
  detailContent,
  headerContent,
  fab,
  hasSelection = false,
  emptyIcon = 'gesture-tap',
  emptyMessage = '항목을 선택하세요',
}: Props) {
  const rightFlex = 1 - leftFlex;

  return (
    <View style={styles.container}>
      {headerContent && <View style={styles.header}>{headerContent}</View>}
      <View style={styles.body}>
        {/* Master panel */}
        <View style={[styles.master, { flex: leftFlex }]}>
          {masterContent}
          {fab && <View style={styles.fab}>{fab}</View>}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Detail panel */}
        <View style={[styles.detail, { flex: rightFlex }]}>
          {hasSelection ? (
            detailContent
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name={emptyIcon} size={40} color={theme.textMuted} />
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  master: {
    position: 'relative',
    borderRightWidth: 0,
  },
  divider: {
    width: 1,
    backgroundColor: theme.borderSubtle,
  },
  detail: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
  },
});
