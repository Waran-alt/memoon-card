/**
 * UI state for offline study queue count (backed by studySync localStorage).
 */
import { create } from 'zustand';
import { getPendingCount } from '@/lib/studySync';

type ConnectionSyncState = {
  hadFailure: boolean;
  pendingCount: number;
  setHadFailure: (v: boolean) => void;
  refreshPendingCount: () => void;
};

export const useConnectionSyncStore = create<ConnectionSyncState>((set) => ({
  hadFailure: false,
  pendingCount: 0,
  setHadFailure: (hadFailure) => set({ hadFailure }),
  /** When the persisted queue is empty, clear hadFailure so the banner does not stick after recovery. */
  refreshPendingCount: () => {
    const pendingCount = getPendingCount();
    set((state) => ({
      pendingCount,
      hadFailure: pendingCount === 0 ? false : state.hadFailure,
    }));
  },
}));
