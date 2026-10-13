import { redirect } from "next/navigation";
import { authenticated } from "../../../lib/auth.ts";
import Login from "../../../components/Login";
export default async function LoginPage() {
  if (await authenticated()) redirect("/admin");
  return <Login />;
}
