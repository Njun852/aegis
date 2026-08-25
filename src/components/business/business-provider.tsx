"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useTransition } from "react";
import type { ReactNode } from "react";
import { switchBusinessAction } from "@/app/actions/business";
import { getBusiness, isModuleEnabled } from "@/lib/businesses";
import type { AegisUser, Business, ModuleKey } from "@/types";

interface BusinessContextValue {
  /** Only the businesses this user may reach — the server already filtered. */
  businesses: Business[];
  activeBusiness: Business;
  activeBusinessId: string;
  user: AegisUser;
  isAdmin: boolean;
  /** Core modules are always true; optional ones follow the stored grant. */
  hasModule: (key: ModuleKey) => boolean;
  switchBusiness: (id: string) => void;
  switching: boolean;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export interface BusinessProviderProps {
  children: ReactNode;
  businesses: Business[];
  activeBusinessId: string;
  user: AegisUser;
}

/**
 * Holds the tenant context for client components. All of it is server-loaded
 * and server-authorised — the provider never decides what a user may see, it
 * only carries what the DAL already allowed through.
 */
export function BusinessProvider({
  children,
  businesses,
  activeBusinessId,
  user,
}: BusinessProviderProps) {
  const router = useRouter();
  const [switching, startTransition] = useTransition();

  const value = useMemo<BusinessContextValue>(() => {
    const activeBusiness =
      getBusiness(activeBusinessId, businesses) ?? businesses[0];

    return {
      businesses,
      activeBusiness,
      activeBusinessId: activeBusiness?.id ?? activeBusinessId,
      user,
      isAdmin: user.role === "aegis_admin",
      hasModule: (key: ModuleKey) => isModuleEnabled(activeBusiness, key),
      switching,
      switchBusiness: (id: string) => {
        startTransition(async () => {
          await switchBusinessAction(id);
          router.push("/dashboard");
          router.refresh();
        });
      },
    };
  }, [activeBusinessId, businesses, router, switching, user]);

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusiness must be used inside a BusinessProvider");
  }
  return context;
}
