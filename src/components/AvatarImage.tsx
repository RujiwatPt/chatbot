"use client";

import Image from "next/image";

type AvatarImageProps = {
  src: string;
  fallbackSrc: string;
  alt: string;
  sizes?: string;
  className?: string;
};

export default function AvatarImage({
  src,
  fallbackSrc,
  alt,
  sizes,
  className,
}: AvatarImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={(event) => {
        const image = event.currentTarget;
        if (src === fallbackSrc || image.dataset.fallbackFor === src) return;

        image.dataset.fallbackFor = src;
        image.srcset = "";
        image.src = fallbackSrc;
      }}
    />
  );
}
