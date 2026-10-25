import TicketDetail from "./ticket-detail";

// The ticket id is only known at request time; do not prerender this route.
export const instant = false;

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TicketDetail ticketId={id} />;
}
