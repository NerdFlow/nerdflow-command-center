import Image from "next/image";

/** Theme-aware NerdFlow wordmark (PNG from brand kit). */
export function BrandWordmark({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <span className={"relative inline-block " + className} style={{ aspectRatio: "217 / 32" }}>
      <Image
        src="/brand/logo-wordmark-dark.png"
        alt="NerdFlow"
        width={217}
        height={32}
        className="brand-logo-dark absolute inset-0 h-full w-auto object-contain object-left"
        priority
      />
      <Image
        src="/brand/logo-wordmark-light.png"
        alt="NerdFlow"
        width={217}
        height={32}
        className="brand-logo-light absolute inset-0 h-full w-auto object-contain object-left"
        priority
      />
    </span>
  );
}

/** Green glasses mark — nav icon / Flow avatar. */
export function BrandMark({ className = "h-8 w-auto", size = 32 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/brand/logo-mark.png"
      alt=""
      width={Math.round(size * 2.9)}
      height={size}
      className={className}
      aria-hidden
    />
  );
}
