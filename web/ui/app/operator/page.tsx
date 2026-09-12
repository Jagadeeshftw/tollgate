import { AppBar, NavTab } from "@/components/AppBar";
import { OperatorConsole } from "@/components/operator/OperatorConsole";
import { readDeployment } from "@/lib/deployment";

export const metadata = { title: "List a service — Tollgate" };

export default function OperatorPage() {
  const deployment = readDeployment();
  return (
    <div className="min-h-dvh bg-ground">
      <AppBar
        nav={
          <>
            <NavTab href="/dashboard">Run</NavTab>
            <NavTab href="/operator" active>List a service</NavTab>
            <NavTab href="/#how">How it works</NavTab>
          </>
        }
        status={<span>Sepolia · your own wallet</span>}
      />
      <OperatorConsole deployment={deployment} />
    </div>
  );
}
