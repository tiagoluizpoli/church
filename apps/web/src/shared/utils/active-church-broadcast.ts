import type { ActiveChurchArea } from '@/shared/utils/active-church-switch';

export interface ActiveChurchSwitchedMessage {
  availableAreas: ActiveChurchArea[];
  churchId: string;
  churchName: string;
}

interface SubscribeToActiveChurchSwitchInput {
  onMessage: (message: ActiveChurchSwitchedMessage) => void;
}

// Active Church is session-wide, not tab-local: BroadcastChannel is the
// simplest mechanism that reaches every other same-origin tab without a
// server round-trip. Tabs that predate BroadcastChannel support simply never
// receive the sync message, which degrades to today's behavior rather than
// throwing.
const ACTIVE_CHURCH_BROADCAST_CHANNEL_NAME = 'active-church-switch';

export function postActiveChurchSwitched(
  message: ActiveChurchSwitchedMessage,
): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(ACTIVE_CHURCH_BROADCAST_CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

export function subscribeToActiveChurchSwitch({
  onMessage,
}: SubscribeToActiveChurchSwitchInput): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(ACTIVE_CHURCH_BROADCAST_CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<ActiveChurchSwitchedMessage>) => {
    onMessage(event.data);
  };
  return () => channel.close();
}
