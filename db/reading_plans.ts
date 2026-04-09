import { getSetting, setSetting } from './settings';

export interface ActivePlan {
  planId: string;
  startDate: string; // ISO date: YYYY-MM-DD
}

export async function getActivePlan(): Promise<ActivePlan | null> {
  const planId = await getSetting('reading_plan_id', '');
  const startDate = await getSetting('reading_plan_start', '');
  if (!planId || !startDate) return null;
  return { planId, startDate };
}

export async function setActivePlan(planId: string, startDate: string): Promise<void> {
  await setSetting('reading_plan_id', planId);
  await setSetting('reading_plan_start', startDate);
}

export async function clearActivePlan(): Promise<void> {
  await setSetting('reading_plan_id', '');
  await setSetting('reading_plan_start', '');
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
