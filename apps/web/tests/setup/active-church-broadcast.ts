import {
  ACTIVE_CHURCH_BROADCAST_CHANNEL_NAME,
  type ActiveChurchSwitchedMessage,
} from '@/shared/utils/active-church-broadcast';

interface ListenAsAnotherTabInput {
  onMessage: (message: ActiveChurchSwitchedMessage) => void;
}

/** A switch posted by another tab: its own channel, which this tab's channel receives. */
export function postFromAnotherTab(message: ActiveChurchSwitchedMessage): void {
  const channel = new BroadcastChannel(ACTIVE_CHURCH_BROADCAST_CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

/** What another tab hears of this tab's switches; returns its unsubscribe. */
export function listenAsAnotherTab({
  onMessage,
}: ListenAsAnotherTabInput): () => void {
  const channel = new BroadcastChannel(ACTIVE_CHURCH_BROADCAST_CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<ActiveChurchSwitchedMessage>) => {
    onMessage(event.data);
  };
  return () => channel.close();
}
