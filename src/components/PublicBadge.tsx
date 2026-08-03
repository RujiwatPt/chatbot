interface PublicBadgeProps {
  isPublic?: boolean | null;
  ownerId?: string | null;
  showPrivate?: boolean;
  className?: string;
}

export default function PublicBadge({
  isPublic,
  ownerId,
  showPrivate = false,
  className = "",
}: PublicBadgeProps) {
  if (isPublic) {
    const isFeatured = ownerId == null;
    if (isFeatured) {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-500 border border-blue-500/20 ${className}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Featured
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500 border border-emerald-500/20 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Public
      </span>
    );
  }

  if (showPrivate) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500 border border-amber-500/20 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Private
      </span>
    );
  }

  return null;
}
