"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { NAME_STUDIO } from "@/lib/brand";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(false);

    const form = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError(true);
      setSubmitting(false);
    } else {
      router.push("/home");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl text-navy">{NAME_STUDIO}</h1>
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 font-ui text-sm text-navy">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded border border-navy/30 bg-white px-3 py-2 font-body text-navy focus:border-emerald focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 font-ui text-sm text-navy">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded border border-navy/30 bg-white px-3 py-2 font-body text-navy focus:border-emerald focus:outline-none"
            />
          </label>
          {error && <p className="font-body text-sm text-navy">That didn&apos;t match.</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded bg-emerald px-4 py-2 font-ui text-white disabled:opacity-60"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
