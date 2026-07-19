import { archiveStaleCompletedTasks } from '../features/tasks/tasks.service';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly is frequent enough for a 15-day threshold

async function sweep(): Promise<void> {
  try {
    const archived = await archiveStaleCompletedTasks();
    if (archived > 0) {
      // eslint-disable-next-line no-console
      console.log(`🗄️  Auto-archived ${archived} task(s) completed 15+ days ago.`);
    }
  } catch (err) {
    // A failed sweep must never crash the server — just retry next interval.
    // eslint-disable-next-line no-console
    console.error('Auto-archive sweep failed:', err);
  }
}

/**
 * Starts the background job that moves tasks completed 15+ days ago into the
 * archive. Runs once immediately (so a restart catches up on any backlog) and
 * then hourly. No external scheduler dependency — this app has a single
 * long-lived Node process, so an in-process interval is sufficient.
 */
export function startAutoArchiveJob(): void {
  void sweep();
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS).unref();
}
