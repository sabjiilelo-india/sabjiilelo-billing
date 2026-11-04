import Nav from "@/components/Nav";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="min-h-screen">
      <Nav username={session?.username ?? ""} />
      <main className="p-4 md:ml-64 md:p-8 print:m-0 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
