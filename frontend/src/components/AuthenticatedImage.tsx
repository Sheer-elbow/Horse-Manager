import { useEffect, useState } from 'react';
import { getAccessToken, tryRefresh } from '../api/client';

interface AuthenticatedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

export function AuthenticatedImage({ src, alt, className, fallback }: AuthenticatedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const token = getAccessToken();
        let res = await fetch(src, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        // If 401, try refreshing the token and retry
        if (res.status === 401) {
          const refreshed = await tryRefresh();
          if (refreshed) {
            const newToken = getAccessToken();
            res = await fetch(src, {
              headers: newToken ? { Authorization: `Bearer ${newToken}` } : {},
            });
          }
        }

        if (!res.ok) throw new Error(`${res.status}`);
        const blob = await res.blob();
        if (!cancelled) setObjectUrl(URL.createObjectURL(blob));
      } catch {
        if (!cancelled) setError(true);
      }
    }

    setError(false);
    setObjectUrl(null);
    load();

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) return <>{fallback ?? null}</>;
  if (!objectUrl) return <>{fallback ?? null}</>;
  return <img src={objectUrl} alt={alt} className={className} />;
}
