import Stripe from "stripe";
import { getEnv } from "@/lib/env";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = getEnv().STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it in .env to enable checkout.",
    );
  }
  if (!stripe) {
    stripe = new Stripe(key, {
      typescript: true,
    });
  }
  return stripe;
}
