import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  size?: "sm" | "md" | "lg" | "hero";
  showWordmark?: boolean;
  className?: string;
  priority?: boolean;
};

const sizes = {
  sm: 28,
  md: 36,
  lg: 56,
  hero: 120,
} as const;

export function BrandLogo({
  href = "/",
  size = "md",
  showWordmark = true,
  className = "",
  priority = false,
}: BrandLogoProps) {
  const px = sizes[size];
  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/brand/logo.png"
        alt="HydraTax"
        width={px}
        height={px}
        priority={priority}
        className="select-none object-contain"
      />
      {showWordmark && (
        <span
          className={`display font-semibold tracking-tight text-ink ${
            size === "hero"
              ? "text-5xl md:text-7xl"
              : size === "lg"
                ? "text-2xl"
                : size === "sm"
                  ? "text-base"
                  : "text-xl"
          }`}
        >
          HydraTax
        </span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="group transition-opacity hover:opacity-90">
      {content}
    </Link>
  );
}
