import { redirect } from "next/navigation";

export default function SettingsWalletRedirect() {
  redirect("/profile/wallet");
}
