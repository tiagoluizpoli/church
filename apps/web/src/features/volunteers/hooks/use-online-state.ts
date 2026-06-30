import { useEffect, useState } from 'react';

function getOnlineState(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.navigator.onLine;
}

export function useOnlineState(): boolean {
  const [isOnline, setIsOnline] = useState(getOnlineState);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
