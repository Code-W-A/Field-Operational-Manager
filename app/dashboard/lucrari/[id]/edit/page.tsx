import { redirect } from "next/navigation";

/** Preserve bookmarked edit routes while using the shared dialog on the detail page. */
export default async function EditLucrarePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(
    `/dashboard/lucrari/${encodeURIComponent(id)}?edit=1&editSource=legacy`,
  );
}
