import { redirect } from "next/navigation";

/** Legacy Clerk route — send everyone to the Hydra sign-up form */
export default function SignUpPage() {
  redirect("/create-account");
}
