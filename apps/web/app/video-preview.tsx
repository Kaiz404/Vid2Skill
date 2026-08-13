"use client";

import { useState } from "react";
import { PlayIcon } from "./icons";
import { thumbnailUrl } from "../lib/youtube";

interface VideoPreviewProps {
  videoId: string;
  title?: string;
  size?: "compact" | "large";
}

export function VideoPreview({ videoId, title, size = "large" }: VideoPreviewProps) {
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  if (thumbFailed) return null;

  return (
    <div className={`video-card video-card-${size}`}>
      {playing ? (
        <iframe
          className="video-frame"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title={title || "YouTube video player"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="video-thumb-button"
          onClick={() => setPlaying(true)}
          aria-label={title ? `Play ${title}` : "Play video"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="video-thumb-img"
            src={thumbnailUrl(videoId)}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
          <span className="video-play-badge">
            <PlayIcon />
          </span>
        </button>
      )}
    </div>
  );
}
