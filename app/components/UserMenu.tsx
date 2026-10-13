// app/components/UserMenu.tsx
// app/components/UserMenu.tsx
"use client";

import { useRouter } from "next/navigation";
import { LogIn, LogOut, User } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { useEffect, useRef, useState } from "react";

export default function UserMenu() {
  const { user, setAuth } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) {
    return (
      <button
        onClick={() => router.push("/login")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white"
      >
        <LogIn className="w-4 h-4" />
        <span>Log in</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white"
      >
        <User className="w-4 h-4" />
        <span className="max-w-[140px] truncate">
          {user.name || user.email}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-card border border-white/10 shadow-lg z-50">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="text-sm font-medium text-foreground truncate">
              {user.email}
            </p>
          </div>

          <button
            onClick={() => {
              router.push("/account");
              setOpen(false);
            }}
            className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-white/10"
          >
            Account settings
          </button>
          <button
            onClick={() => {
              router.push("/account/subscription");
              setOpen(false);
            }}
            className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-white/10"
          >
            Subscription
          </button>

          {user.isAdmin && (
            <button
              onClick={() => {
                router.push("/admin");
                setOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-secondary hover:bg-white/10"
            >
              Admin
            </button>
          )}

          <button
            onClick={() => {
              setAuth(null, null);
              setOpen(false);
              router.push("/");
            }}
            className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-white/10"
          >
            <LogOut className="w-3 h-3 inline mr-1" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
// "use client";

// import { useRouter } from "next/navigation";
// import { LogIn, LogOut, User } from "lucide-react";
// import { useAuth } from "@/app/hooks/useAuth";

// export default function UserMenu() {
//   const { user, setAuth } = useAuth();
//   const router = useRouter();

//   if (!user) {
//     return (
//       <button
//         onClick={() => router.push("/login")}
//         className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white"
//       >
//         <LogIn className="w-4 h-4" />
//         Login
//       </button>
//     );
//   }

//   return (
//     <div className="relative group">
//       <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
//         <User className="w-4 h-4" />
//         {user.name || user.email}
//       </button>

//       <div className="absolute right-0 mt-2 w-40 rounded-xl bg-card border border-white/10 hidden group-hover:block">
//         <button
//           onClick={() => router.push("/my-drafts")}
//           className="block w-full px-4 py-2 text-left text-sm hover:bg-white/10"
//         >
//           My Drafts
//         </button>

//         <button
//           onClick={() => {
//             setAuth(null, null);
//             router.push("/");
//           }}
//           className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-white/10"
//         >
//           <LogOut className="w-3 h-3 inline mr-1" />
//           Logout
//         </button>
//       </div>
//     </div>
//   );
// }
