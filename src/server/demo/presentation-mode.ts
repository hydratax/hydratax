import { cookies } from "next/headers";

/** Session cookie — desk lists only presentation-seeded clients while set. */
export const PRESENTATION_DEMO_COOKIE = "ht_presentation_demo";

export async function isPresentationDemoMode(): Promise<boolean> {
  try {
    const jar = await cookies();
    return jar.get(PRESENTATION_DEMO_COOKIE)?.value === "1";
  } catch {
    return false;
  }
}

export async function enterPresentationDemoMode(): Promise<void> {
  const jar = await cookies();
  jar.set(PRESENTATION_DEMO_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
  });
}

export async function exitPresentationDemoMode(): Promise<void> {
  const jar = await cookies();
  jar.set(PRESENTATION_DEMO_COOKIE, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}
