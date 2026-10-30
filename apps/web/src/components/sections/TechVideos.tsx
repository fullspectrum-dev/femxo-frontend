const VIDEOS = [
  { src: "/videos/femxo_landing_720p.mp4", title: "Femxo landing" },
  { src: "/videos/femxo_school_1080p.mp4", title: "Femxo school" },
] as const;

export function TechVideos() {
  return (
    <section className="relative py-12 sm:py-16" aria-labelledby="demo-heading">
      <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-6">
        <div className="mb-8 text-center sm:mb-10">
          <p className="eyebrow mb-3">Live demos</p>
          <h2
            id="demo-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            See Femxo <span className="text-gold">in action</span>
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {VIDEOS.map((video) => (
            // The footage has a dark backdrop baked in around the app window; the
            // video is scaled up inside the frame so only the window shows.
            <div
              key={video.src}
              className="relative aspect-video overflow-hidden rounded-2xl"
            >
              <video
                src={video.src}
                title={video.title}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                className="absolute left-[-6.8%] top-[-2.8%] block h-auto w-[113.6%] max-w-none"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
