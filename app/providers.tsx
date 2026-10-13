"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./hooks/useAuth";
import { SoundProvider } from "./components/SoundProvider";

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function Providers({ children }: { children: React.ReactNode }) {
  if (!googleClientId) {
    return (
      <AuthProvider>
        <SoundProvider>{children}</SoundProvider>
      </AuthProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthProvider>
        <SoundProvider>{children}</SoundProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
