"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default function VerifyPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="public-main">
      <Link href="/">Hilal Bilet</Link>
      <h1 className="mt-8 text-3xl">Biletimi yoxla</h1>
      <p className="my-4">
        Biletdəki QR kodu skan edin və ya yoxlama keçidini daxil edin.
      </p>
      <form
        className="public-form"
        onSubmit={(event) => {
          event.preventDefault();
          const token = value.trim().split("/tickets/verify/").pop() || "";
          if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
            setError("Biletdəki QR yoxlama keçidini tam daxil edin.");
            return;
          }
          router.push(`/tickets/verify/${token}`);
        }}
      >
        <label htmlFor="verify-link">QR yoxlama keçidi və ya token</label>
        <Input
          id="verify-link"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <Button type="submit">Yoxla</Button>
      </form>
    </main>
  );
}
