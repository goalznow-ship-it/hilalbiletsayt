import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Giriş",
  description: "Hilal Bilet Sisteminə giriş",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
