import {useEffect, useRef, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import {
  isCustomerDisplayVideoMime,
  type CustomerDisplayMediaItem,
  type CustomerDisplayMediaSettings,
} from "@/api/model/customer-display-media.ts";
import {
  fetchCustomerDisplayMediaContent,
  loadCustomerDisplayMediaSettings,
} from "@/lib/customer-display-media.service.ts";
import {detectMimeType} from "@/utils/files.ts";

type PlayableItem = CustomerDisplayMediaItem & {url: string};

type Props = {
  /** When true, show thank-you briefly before media/welcome. */
  thankYou?: boolean;
  /** Idle ads need a DB session; skip on public unpaired browsers. */
  enableMedia?: boolean;
  thankYouNode: React.ReactNode;
  welcomeNode: React.ReactNode;
};

const THANK_YOU_MS = 3000;

export const CustomerDisplayIdleMedia = ({
  thankYou,
  enableMedia = true,
  thankYouNode,
  welcomeNode,
}: Props) => {
  const db = useDB();
  const dbRef = useRef(db);
  dbRef.current = db;

  const [showThankYou, setShowThankYou] = useState(!!thankYou);
  const [settings, setSettings] = useState<CustomerDisplayMediaSettings | null>(null);
  const [playlist, setPlaylist] = useState<PlayableItem[]>([]);
  const [index, setIndex] = useState(0);
  const urlsRef = useRef<string[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setShowThankYou(!!thankYou);
    if (!thankYou) {
      return;
    }
    const timer = window.setTimeout(() => setShowThankYou(false), THANK_YOU_MS);
    return () => window.clearTimeout(timer);
  }, [thankYou]);

  useEffect(() => {
    if (!enableMedia) {
      setSettings(null);
      setPlaylist([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const next = await loadCustomerDisplayMediaSettings(dbRef.current.query);
        if (cancelled) {
          return;
        }
        setSettings(next);
        if (!next.enabled || next.items.length === 0) {
          setPlaylist([]);
          return;
        }

        const loaded: PlayableItem[] = [];
        for (const item of next.items) {
          try {
            const content = await fetchCustomerDisplayMediaContent(
              dbRef.current.query,
              item.documentId,
            );
            if (!content || cancelled) {
              continue;
            }
            const mimeType = item.mimeType || detectMimeType(content, "image/jpeg");
            const blob = new Blob([new Uint8Array(content)], {type: mimeType});
            const url = URL.createObjectURL(blob);
            urlsRef.current.push(url);
            loaded.push({...item, mimeType, url});
          } catch {
            // skip broken document
          }
        }
        if (cancelled) {
          loaded.forEach((item) => URL.revokeObjectURL(item.url));
          return;
        }
        setPlaylist(loaded);
        setIndex(0);
      } catch {
        if (!cancelled) {
          setSettings(null);
          setPlaylist([]);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, [enableMedia]);

  const advance = () => {
    setIndex((prev) => (playlist.length === 0 ? 0 : (prev + 1) % playlist.length));
  };

  const current = playlist[index];
  const isVideo = current ? isCustomerDisplayVideoMime(current.mimeType) : false;
  const rotationMs = Math.max(2, settings?.rotationIntervalSec ?? 8) * 1000;

  useEffect(() => {
    if (showThankYou || !current || isVideo) {
      return;
    }
    const timer = window.setTimeout(advance, rotationMs);
    return () => window.clearTimeout(timer);
  }, [showThankYou, current?.id, isVideo, rotationMs, playlist.length]);

  useEffect(() => {
    if (!isVideo || !videoRef.current) {
      return;
    }
    const el = videoRef.current;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  }, [current?.id, isVideo]);

  if (showThankYou) {
    return <>{thankYouNode}</>;
  }

  if (!settings?.enabled || playlist.length === 0 || !current) {
    return <>{welcomeNode}</>;
  }

  return (
    <div
      className="flex-1 min-h-0 flex items-center justify-center bg-neutral-950 rounded-xl overflow-hidden"
      data-testid="customer-display-idle-media"
    >
      {isVideo ? (
        <video
          key={current.id}
          ref={videoRef}
          src={current.url}
          className="w-full h-full object-contain"
          playsInline
          autoPlay
          muted
          onEnded={advance}
        />
      ) : (
        <img
          key={current.id}
          src={current.url}
          alt={current.name}
          className="w-full h-full object-contain"
        />
      )}
    </div>
  );
};
