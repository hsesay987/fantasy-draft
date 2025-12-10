"use client";

import { useRouter } from "next/navigation";
import { LogIn, LogOut, User } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";

export default function UserMenu() {
  const { user, setAuth } = useAuth();
  const router = useRouter();

  if (!user) {
    return (
      <button
        onClick={() => router.push("/login")}
        className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
      >
        <LogIn className="w-4 h-4" />
        Login
      </button>
    );
  }

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 text-sm text-slate-300 hover:text-white">
        <User className="w-4 h-4" />
        {user.name || user.email}
      </button>

      <div className="absolute right-0 mt-2 w-40 rounded-xl bg-slate-900 border border-slate-700 hidden group-hover:block">
        <button
          onClick={() => router.push("/my-drafts")}
          className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-800"
        >
          My Drafts
        </button>

        <button
          onClick={() => {
            setAuth(null, null);
            router.push("/");
          }}
          className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-800"
        >
          <LogOut className="w-3 h-3 inline mr-1" />
          Logout
        </button>
      </div>
    </div>
  );
}
