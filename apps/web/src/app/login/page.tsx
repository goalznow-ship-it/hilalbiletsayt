"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  GraduationCap,
  Ticket,
  ScanLine,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginRules } from "@/lib/auth";
import { useSession } from "@/components/session-provider";

type LoginValues = { email: string; password: string };

export default function LoginPage() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { signIn } = useSession();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>();
  const submit = async ({ email, password }: LoginValues) => {
    setError("");
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message !== "Failed to fetch"
          ? cause.message
          : "Serverlə əlaqə qurulmadı. Yenidən cəhd edin.",
      );
    }
  };
  return (
    <main className="login-page">
      {/* Left Panel - Branding */}
      <section className="login-brand" aria-label="Hilal Kursları">
        <div className="login-brand-top">
          <Image
            src="/branding/hilal-logo.png"
            alt="Hilal Kursları — rəsmi loqo"
            width={72}
            height={72}
            priority
          />
          <span>HİLAL KURSLARI</span>
        </div>
        <div className="brand-orbits" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="login-brand-copy">
          <span className="brand-kicker">BİLİK. İNAM. GƏLƏCƏK.</span>
          <h1>
            Hər imtahan,
            <br />
            yeni bir başlanğıc.
          </h1>
          <p>Hilal Bilet Sistemi</p>
          <span>İmtahan və bilet idarəetmə platforması</span>
        </div>
        <div className="brand-features">
          <div>
            <GraduationCap aria-hidden="true" />
            <span>İmtahanlar</span>
          </div>
          <div>
            <Ticket aria-hidden="true" />
            <span>Bilet satışı</span>
          </div>
          <div>
            <ScanLine aria-hidden="true" />
            <span>OMR nəticələri</span>
          </div>
        </div>
        <div className="login-brand-footer">Təhsildə etibar etdiyiniz ad.</div>
      </section>
      {/* Right Panel - Login Form */}
      <section className="login-form-panel" aria-labelledby="login-title">
        <div className="login-mobile-brand">
          <Image
            src="/branding/hilal-logo.png"
            alt="Hilal Kursları"
            width={54}
            height={54}
          />
          <span>Hilal Bilet Sistemi</span>
        </div>
        <div className="login-form-wrap">
          <span className="eyebrow">HİLAL BİLET SİSTEMİ</span>
          <h2 id="login-title">Xoş gəlmisiniz.</h2>
          <p className="login-intro">İş sahənizə daxil olaraq davam edin.</p>
          {error && (
            <div className="error-message login-error" role="alert">
              <CircleAlert aria-hidden="true" />
              <p>{error}</p>
            </div>
          )}
          <form
            onSubmit={handleSubmit(submit)}
            className="login-form"
            noValidate
            aria-busy={isSubmitting}
          >
            <div className="field">
              <label htmlFor="email">E-poçt ünvanı</label>
              <Input
                id="email"
                type="email"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="username"
                placeholder="E-poçt ünvanınızı daxil edin"
                {...register("email", loginRules.email)}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                disabled={isSubmitting}
              />
              {errors.email && (
                <p id="email-error" className="field-error" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="password">Şifrə</label>
              <div className="password-input">
                <Input
                  id="password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Şifrənizi daxil edin"
                  {...register("password", loginRules.password)}
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={visible ? "Şifrəni gizlət" : "Şifrəni göstər"}
                  aria-pressed={visible}
                  disabled={isSubmitting}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="field-error" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>
            <div className="remember-row">
              <label>
                <input type="checkbox" disabled /> Məni yadda saxla
              </label>
              <span title="Daimi sessiya xidməti hələ mövcud deyil">
                Tezliklə
              </span>
            </div>
            <Button
              type="submit"
              className="login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle className="spin" aria-hidden="true" /> Giriş
                  edilir…
                </>
              ) : (
                <>
                  Daxil ol <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
            <p className="login-help">
              Girişdə çətinlik var? Filial administratorunuzla əlaqə saxlayın.
            </p>
          </form>
          <div className="login-security">
            <LockKeyhole size={15} aria-hidden="true" />
            <p>Səhifəni yenilədikdə yenidən giriş tələb olunur.</p>
          </div>
        </div>
        <footer className="login-footer">
          <span>© Hilal Kursları</span>
          <span>Diqqətiniz təhsildə qalsın.</span>
        </footer>
      </section>
    </main>
  );
}
