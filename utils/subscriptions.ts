import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';

// RevenueCat API key — 플랫폼별 분리, Expo Go에서는 Test 키 사용
const RC_API_KEY = Platform.select({
  ios: __DEV__
    ? (process.env.EXPO_PUBLIC_TEST_RC_IOS_KEY ?? '')
    : (process.env.EXPO_PUBLIC_RC_IOS_KEY ?? ''),
  android: __DEV__
    ? (process.env.EXPO_PUBLIC_TEST_RC_ANDROID_KEY ?? '')
    : (process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? ''),
}) ?? '';

const AI_ENTITLEMENT_ID = 'Manna Pro';

let _configured = false;

export function configureRevenueCat() {
  if (_configured || !RC_API_KEY) return;
  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    Purchases.configure({ apiKey: RC_API_KEY });
    _configured = true;
  } catch {
    // Expo Go에서는 네이티브 스토어가 없어 configure 실패 — 무시
  }
}

// ── App User ID ───────────────────────────────────────────────────────────

/**
 * Returns the RevenueCat app user ID for use as Worker auth header.
 * In __DEV__ returns a fixed sentinel so mocked Worker calls have a stable ID.
 */
export async function getAppUserId(): Promise<string> {
  if (__DEV__) return '__dev__';
  try {
    const info = await Purchases.getCustomerInfo();
    return info.originalAppUserId;
  } catch {
    return '';
  }
}

// ── Entitlement check ─────────────────────────────────────────────────────

// In-memory cache of last known entitlement.
// Populated by checkAIEntitlement(). Used as an initial value when chapter
// screens remount (e.g. auto-advance) so isProUser-dependent gates (lock screen,
// background playback) don't misfire due to the async resolution of
// Purchases.getCustomerInfo() on fresh mount.
let _cachedEntitlement: boolean | null = null;

/** Synchronous getter for the last known entitlement. null = never resolved. */
export function getCachedEntitlement(): boolean | null {
  return _cachedEntitlement;
}

/**
 * Returns true if the user has an active AI meditation entitlement.
 * In __DEV__ mode always returns true so we can test without EAS Build.
 */
export async function checkAIEntitlement(): Promise<boolean> {
  if (__DEV__) {
    _cachedEntitlement = true;
    return true;
  }
  if (!RC_API_KEY) {
    _cachedEntitlement = false;
    return false;
  }
  try {
    const info = await Purchases.getCustomerInfo();
    const entitled = info.entitlements.active[AI_ENTITLEMENT_ID] !== undefined;
    _cachedEntitlement = entitled;
    return entitled;
  } catch {
    return _cachedEntitlement ?? false;
  }
}

// ── Purchase ──────────────────────────────────────────────────────────────

export type PurchaseError =
  | 'no_offerings'
  | 'cancelled'
  | 'purchase_failed';

export interface PurchaseResult {
  success: boolean;
  error: PurchaseError | null;
}

export async function purchasePremium(): Promise<PurchaseResult> {
  try {
    if (!RC_API_KEY) {
      console.error('[RC] purchasePremium: RC API key not set — cannot purchase');
      return { success: false, error: 'purchase_failed' };
    }

    const offerings = await Purchases.getOfferings();
    console.log('[RC] offerings.current:', offerings.current?.identifier ?? 'null');
    console.log('[RC] availablePackages:', offerings.current?.availablePackages?.map(p => p.identifier));

    const pkg: PurchasesPackage | undefined =
      offerings.current?.availablePackages?.[0];
    if (!pkg) {
      console.error('[RC] No package found in current offering — check RC dashboard');
      return { success: false, error: 'no_offerings' };
    }

    console.log('[RC] Attempting purchase for package:', pkg.identifier, (pkg.product as { identifier?: string })?.identifier);
    await Purchases.purchasePackage(pkg);
    return { success: true, error: null };
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean; code?: number; message?: string; underlyingErrorMessage?: string };
    console.error('[RC] purchasePremium error:', JSON.stringify({
      code: err?.code,
      message: err?.message,
      userCancelled: err?.userCancelled,
      underlyingError: err?.underlyingErrorMessage,
    }));
    if (err?.userCancelled) return { success: false, error: 'cancelled' };
    return { success: false, error: 'purchase_failed' };
  }
}

// ── Restore ───────────────────────────────────────────────────────────────

export async function restorePurchases(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases();
    return info.entitlements.active[AI_ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

export function purchaseErrorMessage(error: PurchaseError): string {
  switch (error) {
    case 'no_offerings': return '현재 구독 상품을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.';
    case 'cancelled':    return '';
    case 'purchase_failed': return '구독 중 오류가 발생했습니다. 다시 시도해주세요.';
  }
}
