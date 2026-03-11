interface SkeletonProps {
  className?: string;
}

/** Animated shimmer placeholder for loading states. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />;
}
