export const loginRules = {
  email: {
    required: "E-poçt ünvanınızı daxil edin.",
    setValueAs: (value: string) => value.trim(),
    pattern: {
      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: "Düzgün e-poçt ünvanı daxil edin.",
    },
  },
  password: { required: "Şifrənizi daxil edin." },
};

export type Branch = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
};
export type CurrentUser = {
  userId: string;
  email: string;
  fullName: string;
  role?: string;
  roles?: string[];
  branches: Branch[];
};

export async function authenticate(email: string, password: string) {
  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Serverlə əlaqə qurulmadı. Yenidən cəhd edin.");
  }
  if (response.status === 401)
    throw new Error(
      "E-poçt və ya şifrə yanlışdır. Hesabınızın aktiv olduğunu yoxlayın.",
    );
  if (response.status === 429)
    throw new Error(
      "Çox sayda cəhd etdiniz. Bir qədər sonra yenidən yoxlayın.",
    );
  if (!response.ok)
    throw new Error(
      "Giriş xidməti əlçatan deyil. Bir qədər sonra yenidən cəhd edin.",
    );
  let data: { access_token?: string };
  try {
    data = (await response.json()) as { access_token?: string };
  } catch {
    throw new Error("Giriş cavabı etibarlı deyil.");
  }
  if (!data || typeof data.access_token !== "string")
    throw new Error("Giriş cavabı etibarlı deyil.");
  let expiresAt: number;
  try {
    const payload = JSON.parse(
      atob(
        data.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
      ),
    ) as { exp: number };
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp))
      throw new Error();
    expiresAt = payload.exp * 1000;
  } catch {
    throw new Error("Giriş cavabı etibarlı deyil.");
  }
  if (expiresAt <= Date.now()) throw new Error("Sessiyanın müddəti bitib.");
  let me: Response;
  try {
    me = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${data.access_token}` },
      cache: "no-store",
    });
  } catch {
    throw new Error("Serverlə əlaqə qurulmadı. Yenidən cəhd edin.");
  }
  if (!me.ok)
    throw new Error("İstifadəçi məlumatları alınmadı. Yenidən cəhd edin.");
  let identity: CurrentUser;
  try {
    identity = (await me.json()) as CurrentUser;
  } catch {
    throw new Error("İstifadəçi məlumatları etibarlı deyil.");
  }
  if (
    !identity ||
    typeof identity.userId !== "string" ||
    typeof identity.email !== "string" ||
    typeof identity.fullName !== "string" ||
    !Array.isArray(identity.branches) ||
    identity.branches.some(
      (b) => !b || typeof b.id !== "string" || typeof b.name !== "string",
    )
  )
    throw new Error("İstifadəçi məlumatları etibarlı deyil.");
  return { token: data.access_token, user: identity, expiresAt };
}
