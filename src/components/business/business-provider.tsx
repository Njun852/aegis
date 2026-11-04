"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useTransition } from "react";
import type { ReactNode } from "react";
import { switchBusinessAction } from "@/app/actions/business";
import { can, type Capability } from "@/lib/business-roles";
import { getBusiness, homePath, isModuleEnabled } from "@/lib/businesses";
import type { AegisUser, Business, BusinessRole, ModuleKey } from "@/types";

interface BusinessContextValue {
  /** Only the businesses this user may reach — the server already filtered. */
  businesses: Business[];
  activeBusiness: Business;
  activeBusinessId: string;
  user: AegisUser;
  isAdmin: boolean;
  /** The role in the active business; null for an administrator or a member without one. */
  businessRole: BusinessRole | null;
  /** Follows the stored grant, narrowed by the role in the active business. */
  hasModule: (key: ModuleKey) => boolean;
  /** Powers beyond a screen; for showing controls only — the server decides. */
  can: (capability: Capability) => boolean;
  /** Where this person lands in the active business. */
  home: string;
  switchBusiness: (id: string) => void;
  switching: boolean;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export interface BusinessProviderProps {
  children: ReactNode;
  businesses: Business[];
  activeBusinessId: string;
  user: AegisUser;
  businessRole: BusinessRole | null;
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
  businessRole,
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
      businessRole,
      hasModule: (key: ModuleKey) => isModuleEnabled(activeBusiness, key),
      can: (capability: Capability) => can({ role: user.role, businessRole }, capability),
      home: homePath(activeBusiness),
      switching,
      switchBusiness: (id: string) => {
        startTransition(async () => {
          await switchBusinessAction(id);
          // The Dashboard sends anyone whose role there lacks it to their own home.
          router.push("/dashboard");
          router.refresh();
        });
      },
    };
  }, [activeBusinessId, businesses, businessRole, router, switching, user]);

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
