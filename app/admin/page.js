import { redirect } from "next/navigation";
import { authenticated } from "../../lib/auth";
import Admin from "../../components/Admin";
export default async function AdminPage() {
  if (!(await authenticated())) redirect("/admin/login");
  return <Admin />;
}
