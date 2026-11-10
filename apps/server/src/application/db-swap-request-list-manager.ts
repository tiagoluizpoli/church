import { compareInstants, now } from '@church/time';
import type {
  ISwapRequestListManager,
  ListLeaderSwapRequestsCommand,
  ScheduleSwapRequests,
} from '../domain/contracts/application/swap-request-list-manager';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';

interface DbSwapRequestListManagerDependencies {
  swapRequestRepo: SwapRequestRepository;
}

export class DbSwapRequestListManager implements ISwapRequestListManager {
  private readonly swapRequestRepo: SwapRequestRepository;

  constructor({ swapRequestRepo }: DbSwapRequestListManagerDependencies) {
    this.swapRequestRepo = swapRequestRepo;
  }

  async listForLeader(input: ListLeaderSwapRequestsCommand) {
    const rows = await this.swapRequestRepo.listForLeader(input);
    const at = now();
    const schedules = new Map<string, ScheduleSwapRequests>();
    for (const { cycleId, ...row } of rows) {
      const schedule = schedules.get(cycleId) ?? {
        cycleId,
        openCount: 0,
        requests: [],
      };
      // Expiry is derived: an open request whose Shift started is expired.
      const status =
        row.status === 'open' &&
        compareInstants({ left: row.startsAt, right: at }) > 0
          ? 'open'
          : 'expired';
      if (status === 'open') schedule.openCount += 1;
      schedule.requests.push({ ...row, status });
      schedules.set(cycleId, schedule);
    }
    return { schedules: [...schedules.values()] };
  }
}
