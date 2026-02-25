'use client';

import { useState, useEffect } from 'react';

/** Tracks navigator.onLine and optionally a "recent failure" flag for showing connection lost message. */
export function useConnectionState(options?: { clearFailureOnOnline?: boolean }) {
  const clearFailureOnOnline = options?.clearFailureOnOnline ?? true;
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [hadFailure, setHadFailure] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      setIsOnline(true);
      if (clearFailureOnOnline) setHadFailure(false);
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [clearFailureOnOnline]);

  return {
    isOnline,
    hadFailure,
    setHadFailure,
  };
}
