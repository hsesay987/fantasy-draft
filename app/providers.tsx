"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./hooks/useAuth";
import { SoundProvider } from "./components/SoundProvider";
import AnalyticsProvider from "./components/AnalyticsProvider";

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function Providers({ children }: { children: React.ReactNode }) {
  if (!googleClientId) {
    return (
      <AuthProvider>
        <SoundProvider>
          <AnalyticsProvider>{children}</AnalyticsProvider>
        </SoundProvider>
      </AuthProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthProvider>
        <SoundProvider>
          <AnalyticsProvider>{children}</AnalyticsProvider>
        </SoundProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
