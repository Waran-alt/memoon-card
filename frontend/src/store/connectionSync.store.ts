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
  refreshPendingCount: () => set({ pendingCount: getPendingCount() }),
}));
