'use client';

import { useEffect, useState } from 'react';
import { getImage } from '@/engine/local';
import type { TitleImage } from '@/lib/types';

/** The uploaded title image's data, read from this browser's storage (null while loading or missing). */
function useTitleImageSrc(image: TitleImage | null | undefined): string | null {
  const [src, setSrc] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!image) return;
    let live = true;
    void getImage(image.id).then((url) => {
      if (live) setSrc({ id: image.id, url });
    });
    return () => {
      live = false;
    };
  }, [image]);
  return image && src?.id === image.id ? src.url : null;
}

/**
 * The show's title: the uploaded PNG artwork when there is one, otherwise the
 * title text. The image is kept in this browser (IndexedDB); if it is missing,
 * it quietly falls back to the text rather than leaving a hole.
 */
export function ShowTitle({
  title,
  image,
  textClassName,
  imageClassName,
}: {
  title: string;
  image: TitleImage | null | undefined;
  textClassName?: string;
  imageClassName?: string;
}) {
  const src = useTitleImageSrc(image);
  if (image && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={title} className={`object-contain ${imageClassName ?? ''}`} />
    );
  }
  return <span className={textClassName}>{title}</span>;
}
