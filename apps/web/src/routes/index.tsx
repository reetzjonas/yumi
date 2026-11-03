import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/lib/api";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.health.$get()).json(),
  });
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">yumi</h1>
      <p className="text-sm opacity-70">API: {health.data?.status ?? "..."}</p>
    </main>
  );
}
