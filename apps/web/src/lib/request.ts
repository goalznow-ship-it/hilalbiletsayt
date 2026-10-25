export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export async function authenticatedRequest<T>(
  token: string | null,
  path: string,
  init?: RequestInit,
  onUnauthorized?: () => void,
): Promise<T> {
  if (!token)
    throw new ApiError(401, "Davam etmək üçün hesabınıza daxil olun.");
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      cache: "no-store",
      headers,
    });
  } catch {
    throw new ApiError(0, "Serverlə əlaqə qurulmadı. Yenidən cəhd edin.");
  }
  if (response.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, "Sessiya bitib. Yenidən daxil olun.");
  }
  if (!response.ok) {
    let message = "";
    if (response.status < 500) {
      try {
        const body: unknown = await response.json();
        if (body && typeof body === "object" && "message" in body) {
          if (typeof body.message === "string") message = body.message;
          else if (Array.isArray(body.message))
            message = body.message
              .filter((value): value is string => typeof value === "string")
              .join(" ");
        }
      } catch {
        // Response body is not JSON; fall back to status-based messages.
      }
    }
    const defaults: Record<number, string> = {
      400: "Məlumatları yoxlayıb yenidən cəhd edin.",
      403: "Bu əməliyyat üçün icazəniz yoxdur.",
      404: "Qeyd tapılmadı.",
      409: "Bu qeyd artıq mövcuddur.",
    };
    throw new ApiError(
      response.status,
      message ||
        defaults[response.status] ||
        "Əməliyyat tamamlanmadı. Yenidən cəhd edin.",
    );
  }
  return response.json() as Promise<T>;
}
