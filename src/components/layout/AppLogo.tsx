import Image from "next/image";
import logo from "@/assets/logo.svg";

/**
 * The clinic mark (heart + ECG + calendar, src/assets/logo.svg) with the
 * "Kardiologická ambulancia" wordmark set in the app font, in the colours of
 * the original wordmark. The same SVG is the favicon (src/app/icon.svg).
 */
export function AppLogo({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className="flex select-none items-center gap-2">
      <Image
        src={logo}
        alt=""
        width={lg ? 72 : 38}
        height={lg ? 72 : 38}
        priority
        unoptimized
      />
      <span className="flex flex-col leading-none">
        <span
          className={`font-bold tracking-tight text-[#082c57] ${lg ? "text-[26px]" : "text-[15px]"}`}
        >
          Kardiologická
        </span>
        <span
          className={`font-medium text-[#fb3c3c] ${lg ? "mt-1 text-[22px]" : "mt-0.5 text-[13px]"}`}
        >
          ambulancia
        </span>
      </span>
    </span>
  );
}
