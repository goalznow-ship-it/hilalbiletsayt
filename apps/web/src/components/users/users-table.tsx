"use client";

interface UserListItem {
  userId: string;
  fullName: string;
  email: string;
  role?: string;
  branches: Array<{ id: string; name: string; isActive: boolean }>;
}

export function UsersTable({ users }: { users: UserListItem[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>İsim</th>
          <th>Email</th>
          <th>Rol</th>
          <th>Filial</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.userId}>
            <td>{user.fullName}</td>
            <td>{user.email}</td>
            <td>
              {user.role ? (
                <span className="badge secondary">{user.role}</span>
              ) : (
                <span>Rol yox</span>
              )}
            </td>
            <td>
              {user.branches.map((b) => b.name).join(", ") || "-"}
            </td>
            <td>
              {user.branches.some((b) => b.isActive) ? (
                <span className="badge">Aktiv</span>
              ) : (
                <span className="badge-destructive">Inaktiv</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
