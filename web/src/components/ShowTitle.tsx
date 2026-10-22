'use client';

import { useState } from 'react';
import { WS_URL } from '@/lib/realtime';
import type { TitleImage } from '@/lib/types';

export function titleImageUrl(image: TitleImage): string {
  return `${WS_URL}/title-image/${image.id}.png`;
}

/**
 * The show's title: the uploaded PNG artwork when there is one, otherwise the
 * title text. If the image fails to load (e.g. the server restarted without its
 * backup), it quietly falls back to the text rather than leaving a hole.
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
  const [failedId, setFailedId] = useState<string | null>(null);
  if (image && failedId !== image.id) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={titleImageUrl(image)}
        alt={title}
        className={`object-contain ${imageClassName ?? ''}`}
        onError={() => setFailedId(image.id)}
      />
    );
  }
  return <span className={textClassName}>{title}</span>;
}
