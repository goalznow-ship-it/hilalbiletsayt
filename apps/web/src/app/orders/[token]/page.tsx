export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
import Receipt from "./receipt";
export const instant = false;
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Receipt token={token} />;
}
