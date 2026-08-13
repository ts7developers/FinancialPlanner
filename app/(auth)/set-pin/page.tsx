import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetPinForm from "./SetPinForm";

export default async function SetPinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  return <SetPinForm email={user.email} />;
}
