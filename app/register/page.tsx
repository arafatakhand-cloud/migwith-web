import Link from "next/link";

// New MIG IDs are created only in the MIGlife app. The web sign-up form was
// turned off; this page stays so old links still land somewhere helpful.
export default function RegisterPage() {
  return (
    <main className="bg-sky-app relative flex min-h-screen items-center justify-center px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-[#174EA6]/90 p-7 text-center shadow-2xl">
        <div className="text-5xl">📱</div>
        <h1 className="mt-4 text-2xl font-black">Create your MIG ID in the app</h1>
        <p className="mt-3 text-sm leading-6 text-white/85">
          New MIG IDs can only be created in the MIGlife app. Once you have one, log in here with the same MIG ID and
          password.
        </p>
        <Link
          href="/login"
          className="mt-6 block rounded-2xl bg-white px-6 py-3.5 font-black text-[#0B2A5B] transition hover:bg-sky-100"
        >
          Login to MIGlife →
        </Link>
        <Link href="/" className="mt-3 block text-sm text-white/80 hover:text-white">
          ← Home
        </Link>
      </div>
    </main>
  );
}
