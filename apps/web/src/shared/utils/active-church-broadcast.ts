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
export const ACTIVE_CHURCH_BROADCAST_CHANNEL_NAME = 'active-church-switch';

let tabChannel: BroadcastChannel | undefined;

// One channel for the whole tab: a channel never receives its own posts, so
// the tab that switches does not react to its own switch as another tab's
// (which would cancel the in-flight Active Church gate it is navigating through).
function getTabChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  tabChannel ??= new BroadcastChannel(ACTIVE_CHURCH_BROADCAST_CHANNEL_NAME);
  return tabChannel;
}

export function postActiveChurchSwitched(
  message: ActiveChurchSwitchedMessage,
): void {
  getTabChannel()?.postMessage(message);
}

export function subscribeToActiveChurchSwitch({
  onMessage,
}: SubscribeToActiveChurchSwitchInput): () => void {
  const channel = getTabChannel();
  if (!channel) return () => {};
  const listener = (event: MessageEvent<ActiveChurchSwitchedMessage>) => {
    onMessage(event.data);
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}
