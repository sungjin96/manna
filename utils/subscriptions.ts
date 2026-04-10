import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';

// RevenueCat API key (iOS only for now)
const IOS_RC_API_KEY = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '';

const AI_ENTITLEMENT_ID = 'Manna Pro';

let _configured = false;

export function configureRevenueCat() {
  if (_configured || !IOS_RC_API_KEY) return;
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  Purchases.configure({ apiKey: IOS_RC_API_KEY });
  _configured = true;
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

/**
 * Returns true if the user has an active AI meditation entitlement.
 * In __DEV__ mode always returns true so we can test without EAS Build.
 */
export async function checkAIEntitlement(): Promise<boolean> {
  if (__DEV__) return true;
  if (!IOS_RC_API_KEY) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[AI_ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
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
    const offerings = await Purchases.getOfferings();
    const pkg: PurchasesPackage | undefined =
      offerings.current?.availablePackages?.[0];
    if (!pkg) return { success: false, error: 'no_offerings' };

    await Purchases.purchasePackage(pkg);
    return { success: true, error: null };
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean };
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
