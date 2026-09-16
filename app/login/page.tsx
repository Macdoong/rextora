import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
        <Image
          src="/brand/rextora-logo-main-transparent.png"
          alt="Rextora"
          width={460}
          height={128}
          className="h-auto w-full max-w-[260px] bg-transparent object-contain"
          priority
          unoptimized
        />
        <h1 className="mt-5 text-2xl font-semibold text-white">로그인</h1>
        <p className="mt-2 text-sm text-slate-400">
          비공개 설치입니다. 초대된 계정만 사용할 수 있습니다.
        </p>
        <div className="mt-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
