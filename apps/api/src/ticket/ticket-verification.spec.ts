import { describe, expect, it } from "vitest";
import { isTicketValidForEntry } from "./ticket-verification";

describe("Ticket QR entry validation", () => {
  it("accepts an active paid ticket", () => {
    expect(
      isTicketValidForEntry({
        status: "ACTIVE",
        price: 3500,
        paymentStatus: "PAID",
      }),
    ).toBe(true);
  });

  it("rejects an unpaid ticket", () => {
    expect(
      isTicketValidForEntry({
        status: "ACTIVE",
        price: 3500,
        paymentStatus: "PENDING",
      }),
    ).toBe(false);
  });

  it("rejects a refunded ticket", () => {
    expect(
      isTicketValidForEntry({
        status: "ACTIVE",
        price: 3500,
        paymentStatus: "REFUNDED",
      }),
    ).toBe(false);
  });

  it("accepts a free ticket", () => {
    expect(
      isTicketValidForEntry({
        status: "ACTIVE",
        price: 0,
        paymentStatus: "PENDING",
      }),
    ).toBe(true);
  });

  it("rejects a refunded free ticket", () => {
    expect(
      isTicketValidForEntry({
        status: "ACTIVE",
        price: 0,
        paymentStatus: "REFUNDED",
      }),
    ).toBe(false);
  });

  it("rejects an already used ticket", () => {
    expect(
      isTicketValidForEntry({
        status: "USED",
        price: 3500,
        paymentStatus: "PAID",
      }),
    ).toBe(false);
  });

  it("rejects a cancelled ticket", () => {
    expect(
      isTicketValidForEntry({
        status: "CANCELLED",
        price: 3500,
        paymentStatus: "PAID",
      }),
    ).toBe(false);
  });
});
