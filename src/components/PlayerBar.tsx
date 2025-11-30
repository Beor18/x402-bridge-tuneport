"use client";

import { usePlayer } from "@/contexts/PlayerContext";

export function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    pause,
    resume,
    seek,
    formatTime,
  } = usePlayer();

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Mobile Player Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-lg border-t border-zinc-800 z-50 md:hidden shadow-2xl">
        {/* Progress Bar - Full Width */}
        <div
          className="h-1 w-full bg-zinc-800 relative cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const newTime = percent * duration;
            seek(newTime);
          }}
        >
          <div
            className="h-full bg-white transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Player Content */}
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-3">
            {/* Cover */}
            <div className="flex-shrink-0">
              {currentTrack.imageUrl ? (
                <img
                  src={currentTrack.imageUrl}
                  alt={currentTrack.title}
                  className="w-14 h-14 rounded object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center">
                  <svg
                    className="w-7 h-7 text-white/30"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Track Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">
                {currentTrack.title}
              </p>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {currentTrack.artist}
              </p>
            </div>

            {/* Play Button */}
            <button
              onClick={isPlaying ? pause : resume}
              className="flex-shrink-0 w-12 h-12 bg-white hover:bg-zinc-100 active:scale-95 rounded-full flex items-center justify-center transition-all shadow-lg"
            >
              {isPlaying ? (
                <svg
                  className="w-6 h-6 text-zinc-900"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6 text-zinc-900 ml-0.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Player Bar */}
      <div className="hidden md:flex fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-lg border-t border-zinc-800 z-50 shadow-2xl">
        <div className="w-full px-6 py-3">
          <div className="flex items-center justify-between gap-6 max-w-7xl mx-auto">
            {/* Left: Track Info */}
            <div className="flex items-center gap-4 min-w-0 flex-[0 0 30%]">
              {currentTrack.imageUrl ? (
                <img
                  src={currentTrack.imageUrl}
                  alt={currentTrack.title}
                  className="w-14 h-14 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-7 h-7 text-white/30"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-zinc-400 truncate mt-0.5">
                  {currentTrack.artist}
                </p>
              </div>
            </div>

            {/* Center: Controls */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[40%]">
              {/* Play Button */}
              <button
                onClick={isPlaying ? pause : resume}
                className="w-10 h-10 bg-white hover:bg-zinc-100 active:scale-95 rounded-full flex items-center justify-center transition-all shadow-md"
              >
                {isPlaying ? (
                  <svg
                    className="w-5 h-5 text-zinc-900"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-zinc-900 ml-0.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Progress Bar with Time */}
              <div className="w-full flex items-center gap-3">
                <span className="text-xs text-zinc-400 font-mono tabular-nums w-11 text-right">
                  {formatTime(currentTime)}
                </span>
                <div
                  className="flex-1 h-1 bg-zinc-800 rounded-full cursor-pointer group relative"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    const newTime = percent * duration;
                    seek(newTime);
                  }}
                >
                  <div
                    className="h-full bg-white rounded-full transition-all duration-75 group-hover:bg-green-400"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-400 font-mono tabular-nums w-11 text-left">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Right: Empty space for future controls */}
            <div className="flex-[0 0 30%]"></div>
          </div>
        </div>
      </div>
    </>
  );
}
