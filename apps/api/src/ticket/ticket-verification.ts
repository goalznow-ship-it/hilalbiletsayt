export type TicketEntryState = {
  status: string;
  price: number;
  paymentStatus: string;
};

export function isTicketValidForEntry(
  ticket: TicketEntryState,
): boolean {
  if (ticket.status !== "ACTIVE") return false;

  if (ticket.paymentStatus === "REFUNDED") return false;

  if (ticket.price === 0) {
    return (
      ticket.paymentStatus === "PENDING" ||
      ticket.paymentStatus === "PAID"
    );
  }

  return ticket.paymentStatus === "PAID";
}
