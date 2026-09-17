import { AdminUsersConsole } from "@/components/rextora/admin/AdminUsersConsole";
import { requireAdminPageUser } from "@/src/lib/rextora/auth/pageAuth";

export default async function AdminUsersPage() {
  await requireAdminPageUser();
  return (
    <div className="rextora-page v3 v3-admin-users" data-testid="admin-users-page">
      <AdminUsersConsole />
    </div>
  );
}
