"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { API_URL, getApiToken } from "@/lib/api";
import type { PostImage } from "./model";

/** Post images are private: fetched with the session token and shown via an object URL. */
export function PrivatePostImage({ image, className }: { image: PostImage; className?: string }) {
  const [loaded, setLoaded] = useState<{ url: string; src: string } | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const token = await getApiToken();
        if (!token || !active) return;
        const res = await fetch(`${API_URL}${image.url}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const blob = await res.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ url: image.url, src: objectUrl });
      } catch {
        // preview unavailable
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.url]);

  const src = loaded?.url === image.url ? loaded.src : null;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- private blob URL, not optimisable by next/image
    <img src={src} alt={image.filename} className={className ?? "h-full w-full object-cover"} />
  ) : (
    <div className="grid h-full w-full place-items-center bg-surface-2" role="img" aria-label={image.filename}>
      <ImageIcon className="size-5 text-fg-3" aria-hidden />
    </div>
  );
}
