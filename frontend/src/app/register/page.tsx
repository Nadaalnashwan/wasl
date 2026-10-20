import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
