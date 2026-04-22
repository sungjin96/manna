import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabletLayout } from '../contexts/TabletLayoutContext';
import { theme } from '../constants/theme';

const SIDEBAR_WIDTH = 220;

const NAV_ITEMS = [
  { label: '홈', icon: 'home' as const, route: '/' },
  { label: '진행률', icon: 'book-open-variant' as const, route: '/progress' },
  { label: '기록', icon: 'notebook-edit-outline' as const, route: '/meditations' },
  { label: '기도', icon: 'hands-pray' as const, route: '/prayers' },
  { label: '설정', icon: 'cog-outline' as const, route: '/settings' },
];

function SidebarContent({ onNavigate }: { onNavigate: (route: string) => void }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  function isActive(route: string) {
    if (route === '/') return pathname === '/' || pathname === '/index';
    return pathname.startsWith(route);
  }

  return (
    <View style={[styles.sidebarInner, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.wordmark}>MANNA</Text>
      <View style={styles.navList}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.route);
          return (
            <Pressable
              key={item.route}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => onNavigate(item.route)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
            >
              <MaterialCommunityIcons
                name={item.icon}
                size={20}
                color={active ? theme.gold : 'rgba(255,255,255,0.55)'}
              />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabletSidebar() {
  const { isTabletLandscape, isDrawerOpen, closeDrawer } = useTabletLayout();
  const router = useRouter();

  const drawerX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isTabletLandscape) return;
    Animated.parallel([
      Animated.timing(drawerX, {
        toValue: isDrawerOpen ? 0 : -SIDEBAR_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: isDrawerOpen ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isDrawerOpen, isTabletLandscape]);

  function navigate(route: string) {
    router.replace(route as any);
    if (!isTabletLandscape) closeDrawer();
  }

  if (isTabletLandscape) {
    return (
      <View style={styles.landscapeSidebar}>
        <SidebarContent onNavigate={navigate} />
      </View>
    );
  }

  // Portrait: animated overlay drawer
  return (
    <View style={styles.drawerContainer} pointerEvents="box-none">
      <Animated.View
        style={[styles.overlay, { opacity: overlayOpacity }]}
        pointerEvents={isDrawerOpen ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>
      <Animated.View
        style={[styles.drawerPanel, { transform: [{ translateX: drawerX }] }]}
      >
        <SidebarContent onNavigate={navigate} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  landscapeSidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: '#0B0A12',
    borderRightWidth: 1,
    borderRightColor: 'rgba(212,168,71,0.12)',
  },
  sidebarInner: {
    flex: 1,
    paddingBottom: 24,
  },
  wordmark: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 5,
    color: theme.gold,
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  navList: {
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 52,
    paddingLeft: 20,
    paddingRight: 16,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  navItemActive: {
    borderLeftColor: theme.gold,
  },
  navLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  navLabelActive: {
    color: theme.gold,
    fontWeight: '600',
  },
  // Portrait drawer
  drawerContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawerPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#0B0A12',
    borderRightWidth: 1,
    borderRightColor: 'rgba(212,168,71,0.12)',
  },
});
