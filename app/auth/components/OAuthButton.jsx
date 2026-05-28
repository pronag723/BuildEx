"use client";

export function DiscordIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a13.4 13.4 0 0 0-.6 1.249 18.328 18.328 0 0 0-5.92 0A13.18 13.18 0 0 0 9.43 3 19.79 19.79 0 0 0 5.67 4.37C2.018 9.768 1.024 15.038 1.52 20.232a19.9 19.9 0 0 0 6.073 3.07 14.6 14.6 0 0 0 1.297-2.107 12.85 12.85 0 0 1-2.04-.984c.171-.126.339-.256.5-.39a14.231 14.231 0 0 0 12.297 0c.165.134.333.264.503.39-.65.387-1.333.717-2.04.984a14.6 14.6 0 0 0 1.297 2.107 19.86 19.86 0 0 0 6.075-3.07c.567-5.939-.93-11.16-3.165-15.863ZM8.515 16.94c-1.183 0-2.158-1.085-2.158-2.42 0-1.337.957-2.42 2.158-2.42 1.21 0 2.176 1.092 2.158 2.42 0 1.335-.957 2.42-2.158 2.42Zm6.97 0c-1.184 0-2.158-1.085-2.158-2.42 0-1.337.957-2.42 2.158-2.42 1.209 0 2.176 1.092 2.158 2.42 0 1.335-.949 2.42-2.158 2.42Z" />
    </svg>
  );
}

export function GoogleIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1l3.2 2.5a9.8 9.8 0 0 0 3-7.4 11 11 0 0 0-.2-2.1H12Z"
      />
      <path
        fill="#34A853"
        d="M5.3 14.3l-.7.6-2.6 2A10 10 0 0 0 12 22a9.5 9.5 0 0 0 6.6-2.4l-3.2-2.5a5.7 5.7 0 0 1-3.4 1A5.8 5.8 0 0 1 6.5 14l-1.2.3Z"
      />
      <path
        fill="#4A90E2"
        d="M2 7.7A9.9 9.9 0 0 0 2 16.3l3.4-2.6a5.8 5.8 0 0 1 0-3.4L2 7.7Z"
      />
      <path
        fill="#FBBC05"
        d="M12 6.2a5.5 5.5 0 0 1 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2 10 10 0 0 0 2 7.7l3.4 2.6A5.8 5.8 0 0 1 12 6.2Z"
      />
    </svg>
  );
}

export default function OAuthButton({
  provider,
  onClick,
  loading = false,
  disabled = false,
  children
}) {
  const isPrimary = provider === "discord";

  const base =
    "group relative w-full flex items-center justify-center gap-3 px-6 py-4 rounded-full font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed";

  const styles = isPrimary
    ? "bg-[#5865F2] text-white hover:bg-[#4752c4] shadow-lg hover:shadow-[0_0_25px_-5px_rgba(88,101,242,0.6)]"
    : "bg-white text-[#0f172a] hover:bg-gray-100 border border-white/10 shadow-lg hover:shadow-[0_0_25px_-5px_rgba(255,255,255,0.35)]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${styles}`}
      aria-label={`Continue with ${provider === "discord" ? "Discord" : "Google"}`}
    >
      {loading ? (
        <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : provider === "discord" ? (
        <DiscordIcon />
      ) : (
        <GoogleIcon />
      )}
      <span className="text-sm sm:text-base">{children}</span>
    </button>
  );
}
