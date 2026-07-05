import { redirect } from "next/navigation";

export default function ServerRedirectPage() {
  redirect("/dashboard");
}
