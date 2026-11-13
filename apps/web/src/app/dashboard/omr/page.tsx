"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OmrPage() {
  const [uploadId, setUploadId] = useState("");
  const router = useRouter();

  const links = [
    { href: "/dashboard/omr/upload", name: "Skan yüklə",
      desc: "Telefon kamerası ilə çək və ya PDF/JPEG/PNG yüklə." },
    { href: "/dashboard/omr/sheets", name: "Cavab vərəqi yarat",
      desc: "Bilet və cavab açarı ilə PDF hazırla." },
    { href: "/dashboard/omr/keys", name: "Cavab açarları",
      desc: "Suallar, düzgün cavablar və bal qaydaları." },
    { href: "/dashboard/omr/results", name: "Skan nəticələri",
      desc: "Manual yoxlama və CSV/Excel ixracı." },
    { href: "/dashboard/results", name: "Nəticələri açıqlamaq",
      desc: "Hazır nəticələri dərc et və namizədlərlə paylaş." },
  ];

  return (
    <main className="omr-workspace mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">OMR idarəetməsi</h1>
        <p className="mt-2 text-sm text-slate-500">
          Cavab açarını hazırlayın, vərəqləri çap edin, telefonla skan edib nəticələri açıqlayın.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {links.map((item) => (
          <Link key={item.href} href={item.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[#7A0014]">
            <h2 className="font-semibold text-[#7A0014]">{item.name}</h2>
            <p className="mt-2 text-sm text-slate-500">{item.desc}</p>
          </Link>
        ))}
      </div>

      <form onSubmit={(event) => {
        event.preventDefault();
        if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uploadId))
          router.push(`/dashboard/omr/uploads/${uploadId}`);
      }} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Skan statusunu yoxla</h2>
        <label htmlFor="omr-upload-id" className="block text-sm text-slate-500">
          Yükləmə UUID-si
        </label>
        <input id="omr-upload-id" value={uploadId}
          onChange={(event) => setUploadId(event.target.value.trim())}
          placeholder="Yükləmə UUID"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm"
        />
        <button type="submit"
          className="rounded-lg bg-[#7A0014] px-5 py-3 text-sm font-semibold text-white">
          Statusa bax
        </button>
      </form>
    </main>
  );
}
