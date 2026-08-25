import { ModulePage } from "@/components/modules/module-page";

export default async function Page(props: PageProps<"/modules/[key]">) {
  const { key } = await props.params;
  return <ModulePage moduleKey={key} />;
}
