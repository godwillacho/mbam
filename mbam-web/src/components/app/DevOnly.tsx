import type { ReactNode } from "react";
import { isDemoWorkspace } from "../../data/mockWorkspace";

interface DevOnlyProps {
  children: ReactNode;
}

export default function DevOnly({ children }: DevOnlyProps) {
  return import.meta.env.DEV && isDemoWorkspace() ? children : null;
}
