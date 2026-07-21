import { Navigate } from "react-router-dom";
import { authService } from "../services/auth.service";

type ProtectedRouteProps = {
  children: React.ReactNode;
  roles: string[];
};

export default function ProtectedRoute({
  children,
  roles,
}: ProtectedRouteProps) {
  const user = authService.getCurrentUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}



