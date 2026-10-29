import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Code, Cpu, Smartphone } from "lucide-react";
import { Container } from "@/components/shared/Container";
import { CAPABILITIES } from "@/lib/constants";

const HERO_STATS = [
  {
    value: "1,00,000",
    label: "Businesses targeted",
    tone: "text-gold",
    position: "right-0 top-2 sm:right-2",
    motion: "hero-float-a",
  },
  {
    value: "38",
    label: "Districts of Bihar",
    tone: "text-foreground",
    position: "left-0 top-[38%] -rotate-2",
    motion: "hero-float-b",
  },
  {
    value: "AI + ERP",
    label: "Digital backbone",
    tone: "text-highlight",
    position: "right-0 top-[52%] rotate-1 sm:top-auto sm:bottom-2 sm:right-8",
    motion: "hero-float-c",
  },
] as const;

// Femxo Tech's services, spaced around the inner ring. Start angles (0° is
// right, clockwise) begin in open space, clear of the stat cards.
const TECH_ORBIT = [
  { icon: Code, angle: 250 },
  { icon: Smartphone, angle: 330 },
  { icon: Bot, angle: 100 },
] as const;

export function Hero() {
  return (
    <section
      className="ink band-ink relative overflow-hidden pt-28 sm:pt-32 lg:pt-36"
      aria-labelledby="hero-heading"
    >
      <div aria-hidden="true" className="dot-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_60%_at_70%_40%,black,transparent)]" />

      <Container className="relative">
        <div className="grid min-w-0 items-center gap-14 pb-16 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
          <div className="min-w-0">
            <p className="eyebrow">Femxo Consultancy Services · Startup Bihar</p>

            <h1
              id="hero-heading"
              className="mt-5 font-display text-[clamp(2.6rem,9vw,4.75rem)] font-bold leading-[0.98] tracking-tight text-foreground [text-shadow:0_4px_0_rgba(90,30,140,0.55)]"
            >
              Digitising Bihar&rsquo;s{" "}
              <span className="text-gold">Local Businesses</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Femxo takes Bihar&rsquo;s local businesses digital: distribution, ERP and AI in
              one connected system, built to help 1,00,000 businesses grow - from Patna
              to the smallest village.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="#entrepreneurs" className="btn-gold">
                Explore the network
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="#contact" className="btn-outline">
                Become a partner
              </Link>
            </div>
          </div>

          {/* Orbit visual: the platform at the centre, the network around it. */}
          <div className="relative mx-auto aspect-square w-full max-w-[30rem]">
            <div className="absolute inset-0" aria-hidden="true">
              {/* Rings stay still; only the carriers inside them turn. */}
              <div className="orbit hero-ring-breathe absolute inset-[6%]" />
              <div className="orbit-carrier animate-orbit-reverse inset-[6%]">
                <span className="absolute left-1/2 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-400 shadow-[0_0_16px_4px_rgba(255,198,92,0.5)]" />
              </div>

              {/* Femxo Tech: its services circle the platform */}
              <div className="orbit absolute inset-[22%]" />
              <div className="orbit-carrier animate-orbit inset-[22%]">
                {TECH_ORBIT.map(({ icon: Icon, angle }) => (
                  <span
                    key={angle}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${50 + 50 * Math.cos((angle * Math.PI) / 180)}%`,
                      top: `${50 + 50 * Math.sin((angle * Math.PI) / 180)}%`,
                    }}
                  >
                    <span className="animate-orbit-counter flex size-8 items-center justify-center rounded-lg border border-white/15 bg-brand-800/90 text-gold-300 shadow-lg sm:size-9">
                      <span className="hero-icon-bob flex">
                        <Icon size={15} />
                      </span>
                    </span>
                  </span>
                ))}
              </div>

              <div className="hero-core-pulse absolute inset-[36%] flex flex-col items-center justify-center gap-1.5 rounded-full border border-white/15 bg-gradient-to-b from-brand-600/70 to-brand-900/80">
                <Image
                  src="/images/femxo-mark-white.png"
                  alt=""
                  width={390}
                  height={570}
                  priority
                  className="h-[38%] w-auto"
                />
                <span className="text-center font-display text-[0.55rem] font-semibold uppercase leading-tight tracking-[0.18em] text-gold-300 sm:text-[0.65rem]">
                  Femxo
                  <br />
                  Ecosystem
                </span>
              </div>

              {/* Outer wrapper holds position and tilt; the card inside floats. */}
              {HERO_STATS.map((stat) => (
                <div key={stat.label} className={`absolute ${stat.position}`}>
                  <div className={`card-glass rounded-xl px-3.5 py-2.5 backdrop-blur-md sm:px-4 sm:py-3 ${stat.motion}`}>
                    <p className={`font-display text-xl font-bold tracking-tight sm:text-2xl ${stat.tone}`}>
                      {stat.value}
                    </p>
                    <p className="mt-0.5 text-[0.7rem] text-muted-foreground sm:text-xs">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="#tech"
              className="hero-float-d group absolute bottom-2 left-0 flex items-center gap-2.5 rounded-xl border border-gold-400/50 bg-brand-900/80 px-3 py-2 shadow-[0_0_30px_-8px_rgba(255,198,92,0.6)] backdrop-blur-md transition-colors hover:border-gold-400 sm:left-2"
            >
              <span className="icon-tile-gold size-7">
                <Cpu size={14} aria-hidden="true" />
              </span>
              <span>
                <span className="block font-display text-sm font-bold text-foreground">Femxo Tech</span>
                <span className="block text-[0.7rem] text-muted-foreground">Web · Apps · AI</span>
              </span>
              <ArrowRight
                size={13}
                aria-hidden="true"
                className="text-gold transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </div>
      </Container>

      <div className="relative border-y border-border/70 bg-background/40 py-4">
        <div className="marquee-mask overflow-hidden">
          <ul className="flex w-max animate-marquee gap-10 pr-10">
            {[...CAPABILITIES, ...CAPABILITIES].map((item, i) => (
              <li
                key={i}
                aria-hidden={i >= CAPABILITIES.length}
                className="flex items-center gap-10 whitespace-nowrap font-display text-base font-medium text-foreground/90 sm:text-lg"
              >
                {item}
                <span className="size-1.5 rounded-full bg-gold-400" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
