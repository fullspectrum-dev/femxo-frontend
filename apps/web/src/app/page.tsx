import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { WhyFemxo } from "@/components/sections/WhyFemxo";
import { Entrepreneurs } from "@/components/sections/Entrepreneurs";
import { Platform } from "@/components/sections/Platform";
import { FemxoTech } from "@/components/sections/FemxoTech";
import { Women } from "@/components/sections/Women";
import { Roadmap } from "@/components/sections/Roadmap";
import { Contact } from "@/components/sections/Contact";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <WhyFemxo />
        <Entrepreneurs />
        <Platform />
        <FemxoTech />
        <Women />
        <Roadmap />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
