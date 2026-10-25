import VerifyTicket from "./verify-ticket";

// The QR token is only known at request time; do not prerender this route.
export const instant = false;

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <VerifyTicket token={token} />;
}
