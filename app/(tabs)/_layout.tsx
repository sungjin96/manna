import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { useUIScale } from '../../contexts/UIScaleContext';

type IconProps = { color: string; size: number };

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { is } = useUIScale();
  // Android 네비게이션 바가 있으면 그만큼 패딩 추가
  const bottomPad = Platform.OS === 'android' ? Math.max(insets.bottom, 8) : 8;
  // 라벨 없음 — 아이콘 크기를 직접 지정해 높이 계산과 일치시킴
  const TAB_ICON = is(26);           // 렌더할 아이콘 크기 (고정 기준 26)
  const tabBarHeight = TAB_ICON + 36 + bottomPad; // 아이콘 + 상하 여백 18씩

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tab.bg,
          borderTopColor: theme.tab.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: bottomPad,
        },
        tabBarActiveTintColor: theme.tab.active,
        tabBarInactiveTintColor: theme.tab.inactive,
        tabBarShowLabel: false,
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 0,
          paddingBottom: 0,
        },
        tabBarIconStyle: {
          width: TAB_ICON,
          height: TAB_ICON,
          overflow: 'visible',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="home" size={TAB_ICON} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: '진행률',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="book-open-variant" size={TAB_ICON} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          href: null,  // 탭바에서 숨김 — 홈 검색바로 접근
        }}
      />
      <Tabs.Screen
        name="meditations"
        options={{
          title: '기록',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="notebook-edit-outline" size={TAB_ICON} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="achievements"
        options={{
          href: null,  // 탭바에서 숨김 — 진행률에서 '전체 보기'로 접근
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="cog-outline" size={TAB_ICON} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
