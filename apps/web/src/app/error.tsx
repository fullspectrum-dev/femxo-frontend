"use client";

import Link from "next/link";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6 text-center">
      <div role="alert" className="max-w-md">
        <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-muted-foreground">This page didn&rsquo;t load. Try again, or go back to the home page.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn-gold" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn-outline">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
