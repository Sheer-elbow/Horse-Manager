import { useEffect, useState } from 'react';
import { getAccessToken } from '../api/client';

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
    let revoked = false;
    setError(false);
    setObjectUrl(null);

    const token = getAccessToken();
    fetch(src, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!revoked) setObjectUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!revoked) setError(true);
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (error) return <>{fallback ?? null}</>;
  if (!objectUrl) return <>{fallback ?? null}</>;
  return <img src={objectUrl} alt={alt} className={className} />;
}
