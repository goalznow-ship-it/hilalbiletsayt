export async function publicRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/public${path}`, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error(
      "Serverlə əlaqə qurulmadı. Məlumatlarınız saxlanılıb, yenidən cəhd edin.",
    );
  }
  if (!response.ok) {
    let message = "Əməliyyat tamamlanmadı. Yenidən cəhd edin.";
    if (response.status < 500) {
      const body = await response.json().catch(() => null);
      if (typeof body?.message === "string") message = body.message;
      else if (Array.isArray(body?.message)) message = body.message.join(" ");
    }
    throw new Error(message);
  }
  return response.json();
}
export type PublicSession = {
  id: string;
  sessionCode: string;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  remaining: number;
};
export type PublicExam = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  price: number;
  sessions: PublicSession[];
};
export type PublicBranch = { id: string; name: string; address: string | null };
export function sessionDate(value: string) {
  return new Date(value).toLocaleString("az-AZ", {
    timeZone: "Asia/Baku",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function sessionInputDate(value: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Baku", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function sessionInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Tarix və saatı düzgün daxil edin.");
  const date = new Date(`${value}:00+04:00`);
  if (Number.isNaN(date.getTime()) || sessionInputDate(date.toISOString()) !== value)
    throw new Error("Tarix və saatı düzgün daxil edin.");
  return date.toISOString();
}
